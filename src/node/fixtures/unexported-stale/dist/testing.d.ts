import type { Btn, BtnHandle } from 'fixture-unexported-stale';

/** Drives a `Btn` in a test, built against a root that exported `BtnHandle`. */
export declare class BtnHarness {
  host(): Btn;
  handle(): BtnHandle;
}
