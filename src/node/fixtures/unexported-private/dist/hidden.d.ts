/** Named only where a consumer is not promised anything. */
export interface Hidden {
  readonly secret: string;
}
/** Named by one public member, so the walk can be seen to have run. */
export interface Label {
  readonly text: string;
}
/**
 * Extended by a public class, which is what a consumer uses.
 *
 * @internal
 */
export declare abstract class PanelBase {
  close(): void;
}
/** Implemented, and never needed by name to use what implements it. */
export interface Shape {
  readonly label: Label;
}
