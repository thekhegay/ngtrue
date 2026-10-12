import type { BtnShape, PressEvent } from 'fixture-unexported-stale/types';

/** A button, built against a `types` entry point that had `PressEvent`. */
export declare class Btn {
  shape: BtnShape;
  press(event: PressEvent): void;
}
