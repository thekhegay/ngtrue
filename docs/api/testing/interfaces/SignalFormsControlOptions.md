[ngtrue](../../index.md) / [testing](../index.md) / SignalFormsControlOptions

# Interface: SignalFormsControlOptions

Defined in: [src/testing/signal-forms-control.ts:44](https://github.com/thekhegay/ngtrue/blob/main/src/testing/signal-forms-control.ts#L44)

Options for [assertSignalFormsControl](../functions/assertSignalFormsControl.md).

## Properties

### selector?

> `readonly` `optional` **selector?**: `string`

Defined in: [src/testing/signal-forms-control.ts:50](https://github.com/thekhegay/ngtrue/blob/main/src/testing/signal-forms-control.ts#L50)

CSS selector for the element carrying `[formField]`, when the fixture binds
more than one. Without it the fixture must hold exactly one bound control —
guessing between two would make the result depend on template order.

***

### values?

> `readonly` `optional` **values?**: readonly \[`unknown`, `unknown`\]

Defined in: [src/testing/signal-forms-control.ts:75](https://github.com/thekhegay/ngtrue/blob/main/src/testing/signal-forms-control.ts#L75)

Two distinct values to drive the value rules with, for a control that does
not pass its value through untouched. The first is written from the form's
side, the way a load or a patch writes, and has to leave the field pristine
and arrive in the model; the second is written by the control and has to
arrive in the field.

The default is a pair of objects with no meaning to anything, which is
right for the common case: a `model()` has no transform, so whatever the
field writes is what the model reports back. A control that normalises —
trims a string, coerces a number, refuses an unparseable entry — will
rightly not keep an anonymous object, and that is a false failure rather
than a defect. Pass two values it accepts. A `checked` model, and a `value`
model currently holding a boolean, need nothing: the probe flips the value
it finds.

The default never puts a clamp to work either, because an object is never
out of range: a clamp that compares leaves it alone, and one that does
arithmetic turns it into `NaN`, which reads as a conversion. For a control
that clamps, make the FIRST value one it would clamp — or start the
fixture's field out of range — so that a clamp written back into the model
has something to do.
