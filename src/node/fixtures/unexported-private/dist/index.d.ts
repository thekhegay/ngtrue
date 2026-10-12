import type { Hidden, Label, Shape } from './hidden.js';
import { PanelBase } from './hidden.js';

export declare class Panel extends PanelBase implements Shape {
  #state;
  private cache;
  private readonly owner: Hidden;
  protected fallback: Hidden;
  static ɵfac: Hidden;
  /** @internal */
  attach(host: Hidden): void;
  readonly keys: keyof Hidden;
  map<T extends string>(value: T): T;
  readonly label: Label;
}
/** @internal */
export declare class PanelRegistry {
  readonly entries: readonly Hidden[];
}
export declare class ɵPanelInternals {
  readonly hidden: Hidden;
}
declare global {
  interface PanelGlobalConfig {
    readonly panel?: boolean;
  }
}
export declare function configure(config: PanelGlobalConfig): void;
