[ngtrue](../../index.md) / [testing](../index.md) / assertSignalFormsControl

# Function: assertSignalFormsControl()

> **assertSignalFormsControl**\<`T`\>(`subject`, `options?`): `Promise`\<`void`\>

Defined in: [src/testing/signal-forms-control.ts:154](https://github.com/thekhegay/ngtrue/blob/main/src/testing/signal-forms-control.ts#L154)

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

Six rules are read off the runtime directive definition, which is where
Angular reads them, so the check and the framework cannot disagree: a `value`
or `checked` `model()`, exactly one of the two, no `ControlValueAccessor`
competing for the binding, and inputs named `disabled` and `readonly` beside
an output named `touch`. Two more are driven through the bound field: the
value must cross in both directions, and `touch` must actually mark the field
touched.

Every name is matched as Angular matches it — by the PUBLIC binding name, not
the class property. `value = model('', { alias: 'val' })` is a control
Angular will never find a model on, and the alias is invisible to anyone
reading the class.

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
model found on the class is the one Angular connected, and that a value
survives the trip in both directions. It says nothing about whether the
component writes its model on every path that changes the value — a control
that updates the field when you type and forgets to when you pick from its
own panel passes this and is broken. That needs the control's own
interactions and belongs in the control's own spec.

## The fixture is spent afterwards

The value is written twice and the field is marked touched, with no attempt
to put either back: a restore that silently failed would leave a later
assertion reading a value this function chose. Give it a fixture of its own.

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
