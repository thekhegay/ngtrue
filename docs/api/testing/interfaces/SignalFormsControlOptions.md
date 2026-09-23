[ngtrue](../../index.md) / [testing](../index.md) / SignalFormsControlOptions

# Interface: SignalFormsControlOptions

Defined in: src/testing/signal-forms-control.ts:33

Options for [assertSignalFormsControl](../functions/assertSignalFormsControl.md).

## Properties

### selector?

> `readonly` `optional` **selector?**: `string`

Defined in: src/testing/signal-forms-control.ts:39

CSS selector for the element carrying `[formField]`, when the fixture binds
more than one. Without it the fixture must hold exactly one bound control —
guessing between two would make the result depend on template order.

***

### values?

> `readonly` `optional` **values?**: readonly \[`unknown`, `unknown`\]

Defined in: src/testing/signal-forms-control.ts:54

Two distinct values to drive the round trip with, for a control that does
not pass its value through untouched.

The default is a pair of objects with no meaning to anything, which is
right for the common case: a `model()` has no transform, so whatever the
field writes is what the model reports back. A control that normalises —
trims a string, coerces a number, refuses an unparseable entry — will
rightly not echo an anonymous object, and that is a false failure rather
than a defect. Pass two values it accepts. A `checked` model, and a `value`
model currently holding a boolean, need nothing: the probe flips the value
it finds.
