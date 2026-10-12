import { BtnBase, DEFAULTS, PRESETS, type BtnOptions, type BtnShape, type PressEvent, type Registration } from './types.js';

/** A button. Every name its signatures use is declared in `types.d.ts`. */
export declare class Btn extends BtnBase {
  shape: BtnShape;
  press(event: PressEvent): void;
  register(registration: Registration): () => void;
}
export declare function createBtn(options: BtnOptions): Btn;
export type BtnPreset = (typeof PRESETS)[number];
export declare const DEFAULT_SHAPE: typeof DEFAULTS.shape;
export declare function pressAll(events: readonly import('./types.js').PressEvent[]): void;
