[ngtrue](../../index.md) / [testing](../index.md) / assertSignalFormsControl

# Function: assertSignalFormsControl()

> **assertSignalFormsControl**\<`T`\>(`subject`, `options?`): `Promise`\<`void`\>

Defined in: [src/testing/signal-forms-control.ts:237](https://github.com/thekhegay/ngtrue/blob/main/src/testing/signal-forms-control.ts#L237)

Assert that a candidate control is wired to Angular's Signal Forms, and fail
naming the rule that broke.

Give it a host that binds the control with `[formField]`, the way a consumer
would — as a factory, so the assertion owns the fixture's creation:

```ts
@Component({
  template: `<my-rating [formField]="form.score" />`,
  imports: [MyRating, FormField],
})
class Host {
  readonly model = signal({ score: 3 });
  readonly form = form(this.model);
}

it('conforms', async () => {
  await assertSignalFormsControl(() => TestBed.createComponent(Host));
});
```

A finished `ComponentFixture` is accepted too and is very slightly weaker.
`[formField]` decides what it bound to while the fixture RENDERS, which
`TestBed.createComponent` does, so a control with no model at all throws
NG1914 out of that call — before an assertion handed the result could look at
anything. Passing the factory lets this function catch that and answer with
the same named rule as everything else, and with the reason Angular's own
message leaves out.

## It is stricter than Angular's own contract, deliberately

In `FormValueControl` only `value` is required; `disabled`, `readonly` and
`touch` are all optional, and a control that omits them compiles, binds and
renders. That optionality is the problem this function exists for. Angular
writes every name it binds onto whatever the control declares and skips the
rest in silence, so an omitted `readonly` is not a missing feature that
someone will notice — it is a schema rule that evaporates, with no error, no
warning and a field that goes on looking editable. A library shipping a
control to other people does not get to leave those three to chance, so
ngtrue requires all three.

## What it checks

Six rules are read off the runtime directive definitions, which is where
Angular reads them: a `value` or `checked` `model()`, exactly one of the two,
no `ControlValueAccessor` competing for the binding, and inputs named
`disabled` and `readonly` beside an output named `touch`. Two more are driven
through the bound field: the value must cross in both directions, and `touch`
must actually mark the field touched.

Every name is matched as Angular matches it — by the PUBLIC binding name, not
the class property. `value = model('', { alias: 'val' })` is a control
Angular will never find a model on, and the alias is invisible to anyone
reading the class.

## A control assembled from host directives

Angular has resolved a custom control through `hostDirectives` since core 22
(angular/angular#67329, "ensure custom controls resolve host directives"),
and building controls that way is common enough that it reached Angular's
tracker twice from people with no connection to each other: "All custom form
controls use this (via the hostDirectives array)" (angular/angular#69562),
and "a common pattern in our codebase" (angular/angular#66592). So the rules
follow Angular's resolution rather than any one class:

- **The control is a directive the template matched** — the component, or an
  attribute directive — and never one of its host directives on its own.
- **Its model is its own** `value` / `valueChange` (or `checked` /
  `checkedChange`) pair if it has one. Otherwise it is a pair that ONE host
  directive exposes, both halves from the same directive, which Angular
  requires; the class property behind it can be called anything, since an
  exposure may alias.
- **`disabled`, `readonly` and `touch` count when the control declares them,
  or when a host directive anywhere beneath it exposes them.** Exposure goes
  straight to the element at every level, so a relay in between does not have
  to re-expose. A member a host directive declares and does NOT expose is
  never written and never listened to — the class reads complete and the
  field never reaches it — so it is reported as missing, naming the
  directive that holds it.
- **`single-model` counts the template's directives, not host directives.** A
  host directive's unexposed model is invisible to Angular, so it is not a
  rival to the component's.

Reading it this way has three limits, and the driven rules cover only part of
them: the round trip and the touch probe go through what Angular actually
connected, so they catch a wrong reading of the MODEL and of `touch`, and
nothing catches one of `disabled` or `readonly`, which no fixture can turn on.

The walk reads Angular's private definition fields — `hostDirectives`,
including the function form the compiler emits when one is named through
`forwardRef` — and those can move between minors. A definition that no longer
carries the field, or an entry naming something that is not a directive, is
refused with an error rather than read as having no host directives: reading
none would make every host directive a candidate of its own, and a control
whose `readonly` sits unexposed on a complete host directive would pass. A
change in what Angular DOES with a field it can still read is what ngtrue's
own spec pins, and that runs against the Angular ngtrue was tested with, not
the one a consumer installs.

No definition shows that a TEMPLATE applied one of the control's host
directives by hand, which makes Angular treat it as the template's and drop
the exposure the control declared. For the model and `touch` the driven rules
fail there. For `disabled` and `readonly` the drop is harmless under the same
name, because the directive the template matched publishes `disabled` itself
and Angular writes it there — but an ALIASED exposure (`inputs:
['isDisabled: disabled']`) goes with the entry, and this check passes a
fixture in which Angular writes neither input. Measured on core 22.2.1 and
pinned in ngtrue's own spec. It is the fixture's template and not the
control, which is one more reason to bind the control exactly as a consumer
would and nothing more.

The last has no driven rule to catch it, because Angular itself agrees with
the answer. When two entries reach the same host directive, Angular merges
their exposures by writing into whichever entry it met first, and that entry
can belong to a SHARED behaviour directive's definition. Measured on core
22.2.1, and pinned in ngtrue's own spec so this paragraph goes when the
behaviour does: a component composing a behaviour plus an extra exposure of
the behaviour's own host directive adds that exposure to the behaviour
itself, so every other control composing the behaviour exposes it too — once
the first has rendered, for the rest of the run. Definitions are read after
Angular has resolved them, so this answers with what Angular binds at that
moment: a control leaning on such an exposure passes after the other
component has rendered in the same run and fails without it.

## What it does not check, and why

**It cannot turn `readonly` or `disabled` on.** Those states come from the
schema, and Angular offers no public way to write a nested directive's signal
input from outside its template. So the presence of the two inputs is checked
and their behaviour is not — which is a smaller gap than it sounds, because
presence is the whole of Angular's mechanism. What a reviewer still has to
do by hand:

- **Read-only must not be disabled.** A read-only control keeps its tab stop,
  keeps announcing its value and still submits; only the write path is
  refused. Delegating `readonly` to `disabled` passes every rule here.
- **`aria-readonly` belongs only on a role that allows it** — `checkbox`,
  `switch`, `radiogroup`, `combobox`, `slider`, `textbox` — and is illegal on
  `radio`, `tree`, `group` and `button`. jsdom computes no implicit roles, so
  there is nothing here to hold an attribute against.
- **A composite whose own parts are controls must shield its subtree** from
  the surrounding field and read the real one with `skipSelf`, or its inner
  controls each announce the outer field's error as their own. That turns on
  the library's own form-field token, which ngtrue cannot know about.

**The round trip proves the binding, not the component.** It shows that the
model resolved from the definitions is the one Angular connected, and that a
value survives the trip in both directions. It says nothing about whether the
component writes its model on every path that changes the value — a control
that updates the field when you type and forgets to when you pick from its
own panel passes this and is broken. That needs the control's own
interactions and belongs in the control's own spec.

## The fixture is spent afterwards

The value is written twice and the field is marked touched, with no attempt
to put either back: a restore that silently failed would leave a later
assertion reading a value this function chose. Give it a fixture of its own,
bound to a field the schema leaves interactive: Signal Forms reads `touched`
as false on a hidden, disabled or read-only field whatever has been marked,
so the last rule refuses such a fixture rather than blaming the control for
it.

## Type Parameters

### T

`T`

## Parameters

### subject

`ComponentFixture`\<`T`\> \| (() => `ComponentFixture`\<`T`\>)

### options?

[`SignalFormsControlOptions`](../interfaces/SignalFormsControlOptions.md) = `{}`

## Returns

`Promise`\<`void`\>

## Throws

naming the first rule that broke. First
  rather than all of them, because the later rules cannot be evaluated until
  the earlier ones hold — there is nothing to drive a round trip through
  until a model has been found.

## Since

0.1.0
