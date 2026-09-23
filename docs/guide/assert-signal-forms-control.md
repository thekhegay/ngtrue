# assertSignalFormsControl

`ngtrue/testing`

Assert that a custom control is wired to Angular's Signal Forms, and fail naming
the rule that broke.

## A runnable example

```ts
import { Component, model, input, output, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormField, form, type FormValueControl } from '@angular/forms/signals';
import { assertSignalFormsControl } from 'ngtrue/testing';

@Component({ selector: 'my-rating', template: '<span>{{ value() }}</span>' })
export class MyRating implements FormValueControl<number> {
  readonly value = model(0);
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly touch = output<void>();
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

| Rule                  | What it means                                                           |
| --------------------- | ----------------------------------------------------------------------- |
| `value-model`         | A writable `value` or `checked` model, found by its public binding name |
| `single-model`        | One of the two, not both                                                |
| `no-value-accessor`   | No `NG_VALUE_ACCESSOR` on the same element                              |
| `touch-output`        | An output named exactly `touch`                                         |
| `disabled-input`      | An input named `disabled`                                               |
| `readonly-input`      | An input named `readonly`                                               |
| `value-round-trip`    | The value crosses in both directions                                    |
| `touch-marks-touched` | Emitting `touch` marks the field touched                                |

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

There is no option to switch a rule off. A conformance suite you can quiet is a
conformance suite that tells you what you wanted to hear.

## Names are matched the way Angular matches them

By the **public binding name**, not the class property. This control has no
model as far as Angular is concerned, and nothing about reading the class says
so:

```ts
readonly value = model('', { alias: 'val' }); // binding name is `val`
```

## Controls that normalise their value

The round trip drives the field with two anonymous objects, which is right for a
control whose model passes values through untouched — most of them. A control
that coerces will rightly refuse an object, and that is a false failure rather
than a defect. Give it values it accepts:

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

**The round trip proves the binding, not the component.** It shows that the
model found on the class is the one Angular connected and that a value survives
the trip. It says nothing about whether the component writes its model on every
path that changes the value — a control that updates the field when you type and
forgets when you pick from its own panel passes this and is broken. That needs
the control's own interactions, and belongs in the control's own spec.

**The fixture is spent afterwards.** The value is written twice and the field is
marked touched, with no attempt to put either back: a restore that silently
failed would leave a later assertion reading a value this function chose.
