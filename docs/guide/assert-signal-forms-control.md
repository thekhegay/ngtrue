# assertSignalFormsControl

`ngtrue/testing`

Assert that a custom control is wired to Angular's Signal Forms, and fail naming
the rule that broke.

## A runnable example

```ts
import {
  Component,
  input,
  model,
  output,
  provideZonelessChangeDetection,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormField, form, type FormValueControl } from '@angular/forms/signals';
import { assertSignalFormsControl } from 'ngtrue/testing';

@Component({
  selector: 'my-rating',
  template: `
    <input
      #el
      type="range"
      min="0"
      max="5"
      [value]="value()"
      (input)="value.set(el.valueAsNumber)"
      (blur)="touch.emit()"
    />
  `,
})
export class MyRating implements FormValueControl<number> {
  readonly value = model(0);
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly touch = output<void>();
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('el');

  focus(options?: FocusOptions): void {
    this.field().nativeElement.focus(options);
  }
}

@Component({
  template: `<my-rating [formField]="form.score" />`,
  imports: [MyRating, FormField],
})
class Host {
  readonly model = signal({ score: 3 });
  readonly form = form(this.model);
}

describe('MyRating', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('is a conforming Signal Forms control', async () => {
    await assertSignalFormsControl(() => TestBed.createComponent(Host));
  });
});
```

Pass a **factory**, not a finished fixture. `[formField]` decides what it bound
to while the fixture renders, and `TestBed.createComponent` renders — so a
control with no model at all throws `NG01914` out of that call, before an
assertion handed the result could look at anything. Owning the creation lets
this function convert that into the same named rule as everything else, and add
the reason Angular's message leaves out. A finished fixture is accepted and is
very slightly weaker.

## The rules

Checked in this order; the first failure is reported, because the later rules
cannot be evaluated until the earlier ones hold.

| Rule                    | What it means                                                           |
| ----------------------- | ----------------------------------------------------------------------- |
| `value-model`           | A writable `value` or `checked` model, found by its public binding name |
| `single-model`          | One of the two, not both                                                |
| `no-value-accessor`     | No `NG_VALUE_ACCESSOR` on the same element                              |
| `touch-output`          | An output named exactly `touch`                                         |
| `disabled-input`        | An input named `disabled`                                               |
| `readonly-input`        | An input named `readonly`                                               |
| `write-keeps-pristine`  | A value the form writes leaves a pristine field pristine                |
| `value-round-trip`      | The value crosses in both directions                                    |
| `touch-marks-touched`   | Emitting `touch` marks the field touched                                |
| `focus-reaches-control` | Asking the field to focus the control leaves focus on it or inside it   |

The id is on the thrown error, so a test can assert which rule failed rather
than matching prose that will get reworded:

```ts
import { SignalFormsControlError } from 'ngtrue/testing';

const error = await assertSignalFormsControl(() => TestBed.createComponent(Host)).catch(e => e);
expect(error).toBeInstanceOf(SignalFormsControlError);
expect((error as SignalFormsControlError).rule).toBe('readonly-input');
```

## It is stricter than Angular's contract, on purpose

In `FormValueControl` only `value` is required. `disabled`, `readonly` and
`touch` are optional, and a control that omits all three compiles, binds and
renders.

That optionality is the reason this function exists. Angular writes every name
it binds onto whatever the control declares and skips the rest **in silence**.
So an omitted `readonly` is not a missing feature somebody will notice — it is a
`readonly()` rule in a schema that evaporates, with no error, no warning, and a
field that goes on looking editable. A library shipping controls to other people
does not get to leave that to chance.

`focus()` is optional in the same way. A control without one is focused through
its host element, and a custom element with no tab stop takes no focus — so
`focusBoundControl()`, which a form calls to take the user to the first invalid
field after a failed submit, does nothing and says nothing. The rule does not
demand the method, because a host that is itself the interactive element is
focused correctly without one. It demands the outcome: focus on the host or
inside it. Forwarding is the usual fix, and the example above does it.

There is no option to switch a rule off. A conformance suite you can quiet is a
conformance suite that tells you what you wanted to hear.

## A value the form writes is not an edit

Signal Forms cannot tell who changed a control's model. Every value a control
reports back is recorded as the user's edit and marks the field dirty. So a
control that adjusts a value it was **handed** — normalises `null` to `''`,
clamps it into range, fills in a default — and writes the adjustment back turns
a form that has only been loaded into one that has been edited. Nothing says so:
an unsaved-changes guard fires on a page nobody touched, and the value the form
loaded is gone. A clamp written back deletes the very out-of-range value a
`max()` rule exists to report.

```ts
const MAX = 100;

// Dirties a form that has only been loaded, and replaces what it loaded with 100.
export class ClampsTheModel {
  readonly value = model(0);

  constructor() {
    effect(() => {
      if (this.value() > MAX) this.value.set(MAX);
    });
  }
}

// Leaves it pristine: only what the user sees is clamped, and a `max()` rule on
// the schema reports the out-of-range value.
export class ClampsTheDisplay {
  readonly value = model(0);
  protected readonly shown = computed(() => Math.min(this.value(), MAX));
}
```

Decorators, `disabled`, `readonly`, `touch` and `focus()` are left out of both;
what differs is only where the clamp lands.

`write-keeps-pristine` writes from the form's side twice and reads `dirty()`
after each: once by rendering, which hands the control the value the fixture
started the field with, and once through the field's `value.set`, the way a load
or a patch writes. Only a different value written back can dirty the field, so
the rule passes a control that adjusts nothing and one that adjusts only what it
shows. It does not judge whether an adjustment is wanted, only that it is not
recorded as an edit.

It sees a clamp only when something written is out of range, and the default
probes are anonymous objects, which never are. For a control that clamps, start
the fixture's field out of range on purpose:

```ts
@Component({
  template: `<my-knob [formField]="form.level" />`,
  imports: [MyKnob, FormField],
})
class Host {
  // Above the knob's maximum of 100, so a clamp written back has something to do.
  readonly model = signal({ level: 150 });
  readonly form = form(this.model);
}
```

Or pass `values` whose first value is out of range, `{ values: [150, 20] }`,
which is the one the form writes. The same goes for a control that normalises
only some values — whitespace, case, a date's time of day: it is caught by a
start or a first value it would change.

## Names are matched the way Angular matches them

By the **public binding name**, not the class property. This control has no
model as far as Angular is concerned, and nothing about reading the class says
so:

```ts
readonly value = model('', { alias: 'val' }); // binding name is `val`
```

## Controls assembled from host directives

Since Angular 22 a custom control can come together through `hostDirectives`,
and the rules follow Angular's resolution rather than any one class. This
control keeps its shared state in a directive and passes:

```ts
import {
  Component,
  Directive,
  input,
  model,
  output,
  provideZonelessChangeDetection,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormField, form, type FormValueControl } from '@angular/forms/signals';
import { assertSignalFormsControl } from 'ngtrue/testing';

@Directive()
export class ControlState {
  readonly disabled = input(false);
  readonly readonly = input(false);
}

@Component({
  selector: 'my-rating',
  template: `
    <input
      #el
      type="range"
      min="0"
      max="5"
      [value]="value()"
      (input)="value.set(el.valueAsNumber)"
      (blur)="touch.emit()"
    />
  `,
  hostDirectives: [{ directive: ControlState, inputs: ['disabled', 'readonly'] }],
})
export class MyRating implements FormValueControl<number> {
  readonly value = model(0);
  readonly touch = output<void>();
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('el');

  focus(options?: FocusOptions): void {
    this.field().nativeElement.focus(options);
  }
}

@Component({
  template: `<my-rating [formField]="form.score" />`,
  imports: [MyRating, FormField],
})
class Host {
  readonly model = signal({ score: 3 });
  readonly form = form(this.model);
}

it('is a conforming Signal Forms control', async () => {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  await assertSignalFormsControl(() => TestBed.createComponent(Host));
});
```

Drop `'readonly'` from that `inputs` list and it fails `readonly-input`, naming
`ControlState`: the directive still declares the input, and Angular never writes
it, because a host directive's member is bound only when the entry exposes it.

What counts:

- The control is a directive the template matched, never a host directive on its
  own.
- Its model is its own `value` / `valueChange` pair, or one that a single host
  directive exposes in full. The property behind it can be called anything,
  since an exposure can alias: `inputs: ['score: value']`.
- `disabled`, `readonly` and `touch` count when the control declares them or a
  host directive at any depth exposes them. A nested exposure reaches the
  element directly, so a relay in between does not re-expose.
- A host directive's unexposed model is invisible to Angular, so it does not
  break `single-model`.
- `focus()` stays on the control. Angular calls it on the directive the template
  matched, even when the model comes from beneath, and never on a host
  directive: an input or an output can be exposed, a method cannot. That is why
  `focus()` sits on `MyRating` above while its state does not.

Three limits. The round trip and the touch probe go through what Angular
actually connected, so they catch a wrong reading of the model and of `touch`;
nothing catches one of `disabled` or `readonly`, because no fixture can turn
either on.

- The walk reads Angular's private definition fields, which can move between
  minor releases. When the layout is not the one it knows, it throws instead of
  answering: reading it as "no host directives" would count each host directive
  as a control of its own and could pass one whose `readonly` is never written.
- No definition shows that a template applied one of the control's host
  directives by hand, which makes Angular drop the exposure. The model and
  `touch` fail the driven rules there. `disabled` and `readonly` survive under
  their own names, since the directive the template matched publishes them
  itself — but an aliased exposure such as `inputs: ['isDisabled: disabled']`
  is gone, and the check passes a fixture in which Angular writes neither. Bind
  the control in its fixture exactly as a consumer would, and nothing more.
- When two entries reach the same host directive, Angular merges their
  exposures by writing into a definition that other components may share, so an
  exposure one control adds can show up on another rendered later in the same
  run. The check agrees with Angular there, and nothing catches it: a control
  leaning on such an exposure passes after the other has rendered and fails
  without it.

## Controls that normalise their value

The value rules drive the field with two anonymous objects. The first is written
from the form's side and has to leave the field pristine and reach the model;
the second is written by the control and has to reach the field. That is right
for a control whose model passes values through untouched — most of them. A
control that coerces will rightly change an object, and that is a false failure
rather than a defect. Give it values it keeps as written:

```ts
await assertSignalFormsControl(() => TestBed.createComponent(Host), { values: [1, 2] });
```

A `checked` model, and a `value` model currently holding a boolean, need
nothing: the probe flips the value it finds.

## More than one control in the fixture

```ts
await assertSignalFormsControl(() => TestBed.createComponent(Host), { selector: 'my-rating' });
```

Without a selector, a fixture with two bound controls is refused rather than
guessed at — choosing would make the answer depend on template order.

## What it does not check

**It cannot turn `readonly` or `disabled` on.** Those states come from the
schema and Angular offers no public way to write a nested directive's signal
input from outside its template. The presence of the two inputs is checked and
their behaviour is not, which is a smaller gap than it sounds — presence is the
whole of Angular's mechanism. What is left for a reviewer:

- **Read-only must not be disabled.** A read-only control keeps its tab stop,
  keeps announcing its value and still submits; only the write path is refused.
  Routing `readonly` into `disabled` passes every rule above.
- **`aria-readonly` belongs only on a role that allows it** — `checkbox`,
  `switch`, `radiogroup`, `combobox`, `slider`, `textbox` — and is illegal on
  `radio`, `tree`, `group` and `button`. jsdom computes no implicit roles, so
  there is nothing here to hold an attribute against.
- **A composite whose own parts are controls must shield its subtree** from the
  surrounding field and read the real one with `skipSelf`, or its inner controls
  each announce the outer field's error as their own. That turns on your
  library's own form-field token, which ngtrue cannot know about.

**The focus rule proves focus arrived, not that it arrived somewhere useful.**
jsdom has no layout, so a target clipped to nothing, moved off-screen,
zero-sized or `visibility: hidden` still takes focus in a test, and
`display: none` stops it only where jsdom's own cascade resolves the
declaration. Nor does the rule look at what took focus: a `focus()` that lands on
a wrapper with `tabindex="-1"` passes, while a keyboard user can never tab back
to it and a screen reader announces a nameless group instead of the field.
Whether focus reaches the element that takes input, and whether anybody can see
it, is a reviewer's job.

The rule waits for the render after the call and for nothing later. A `focus()`
deferred with `afterNextRender` passes; one deferred with `setTimeout` is
reported as a miss, though focus would get there in an application. No timer is
awaited, so the assertion works under fake timers.

**The pristine rule sees an adjustment only when the value written needs one.**
It writes the fixture's starting value and the first probe value, and nothing
else, so an in-range start and the default `values` never put a clamp to work.
A control that clamps into its model passes with them, or fails on the default
probe as a conversion and then passes on in-range `values` — the example above
shows how to give the clamp something to do. It also takes the fixture at its
word: nothing but the control is supposed to write to the field before the
assertion does, so a field that is dirty after the first render is reported
against the control, and a test that dirtied the field itself before handing it
over gets the same report.

**The round trip proves the binding, not the component.** It shows that the
model resolved from the definitions is the one Angular connected and that a
value survives the trip. It says nothing about whether the component writes its
model on every path that changes the value — a control that updates the field
when you type and forgets when you pick from its own panel passes this and is
broken. That needs the control's own interactions, and belongs in the control's
own spec.

**The fixture is spent afterwards.** The value is written twice, the field is
marked touched and focus is moved into the control, with no attempt to put any
of it back: a restore that silently failed would leave a later assertion reading
a value this function chose. Hand it a fresh fixture, since a field that is
already dirty is read as the control's doing. Bind the control to a field the
schema leaves interactive, too: Signal Forms reads `dirty` and `touched` as
false on a hidden, disabled or read-only field whatever has been written or
marked, so `write-keeps-pristine` and `touch-marks-touched` refuse that fixture
rather than vouch for the control or blame it. And keep the fixture attached to
the document, the way `TestBed.createComponent` leaves it — nothing detached can
take focus, and the focus rule says so rather than blaming the control.
