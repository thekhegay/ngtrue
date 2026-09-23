[ngtrue](../../index.md) / [testing](../index.md) / SignalFormsControlRule

# Type Alias: SignalFormsControlRule

> **SignalFormsControlRule** = `"value-model"` \| `"single-model"` \| `"no-value-accessor"` \| `"touch-output"` \| `"disabled-input"` \| `"readonly-input"` \| `"value-round-trip"` \| `"touch-marks-touched"`

Defined in: [src/testing/signal-forms-control.ts:11](https://github.com/thekhegay/ngtrue/blob/main/src/testing/signal-forms-control.ts#L11)

The rules [assertSignalFormsControl](../functions/assertSignalFormsControl.md) can break, in the order it checks
them. The id is on the thrown [SignalFormsControlError](../classes/SignalFormsControlError.md), so a test can
assert WHICH rule failed rather than matching prose that will be reworded.
