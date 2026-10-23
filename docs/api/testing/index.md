[ngtrue](../index.md) / testing

# testing

`ngtrue/testing` — helpers that run inside a test and must never reach an
application bundle.

Everything here may import `@angular/core/testing` and reason about a
`ComponentFixture`. Nothing here may be imported by `ngtrue` or by
`ngtrue/node`: the split is the guarantee, and a single import across it
would put the test harness on a path an application build can follow.

## Classes

- [SignalFormsControlError](classes/SignalFormsControlError.md)
- [ZoneEventWaitError](classes/ZoneEventWaitError.md)

## Interfaces

- [SignalFormsControlOptions](interfaces/SignalFormsControlOptions.md)
- [ZoneEventWait](interfaces/ZoneEventWait.md)
- [ZoneEventWaitOptions](interfaces/ZoneEventWaitOptions.md)

## Type Aliases

- [SignalFormsControlRule](type-aliases/SignalFormsControlRule.md)

## Functions

- [assertSignalFormsControl](functions/assertSignalFormsControl.md)
- [assertNoZoneEventWaits](functions/assertNoZoneEventWaits.md)
