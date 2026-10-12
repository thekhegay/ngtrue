/** The corner treatment. */
export type BtnShape = 'rounded' | 'pill';
/** What a press reports. */
export interface PressEvent {
  readonly at: number;
}
/** What `createBtn` accepts. */
export interface BtnOptions {
  readonly shape?: BtnShape;
}
/** The behaviour every button shares. */
export declare abstract class BtnBase {
  focus(): void;
}
/** The presets `BtnPreset` is read from. */
export declare const PRESETS: readonly ['primary', 'ghost'];
/** What a button starts as. */
export declare const DEFAULTS: {
  readonly shape: BtnShape;
};
/**
 * What a child hands its parent to be counted.
 *
 * @internal
 */
export interface Registration {
  readonly id: string;
}
