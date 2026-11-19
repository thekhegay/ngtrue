import * as i0 from '@angular/core';

/** The identity a field hands to its label. A host directive, applied by the field component. */
export declare class FieldIdentity {
  static ɵfac: i0.ɵɵFactoryDeclaration<FieldIdentity, never>;
  static ɵdir: i0.ɵɵDirectiveDeclaration<FieldIdentity, never, never, {}, {}, never, never, true, never>;
}
/** The tone every field shares. A host directive, applied by the base class below. */
export declare class FieldTone {
  static ɵfac: i0.ɵɵFactoryDeclaration<FieldTone, never>;
  static ɵdir: i0.ɵɵDirectiveDeclaration<FieldTone, never, never, {}, {}, never, never, true, never>;
}
/** A hint some hosts apply. Only the root exports it. */
export declare class FieldHint {
  static ɵfac: i0.ɵɵFactoryDeclaration<FieldHint, never>;
  static ɵdir: i0.ɵɵDirectiveDeclaration<FieldHint, never, never, {}, {}, never, never, true, never>;
}
/** A base that applies `FieldTone` to every directive extending it. */
export declare abstract class FieldBase {
  static ɵfac: i0.ɵɵFactoryDeclaration<FieldBase, never>;
  static ɵdir: i0.ɵɵDirectiveDeclaration<
    FieldBase,
    never,
    never,
    {},
    {},
    never,
    never,
    true,
    [{ directive: typeof FieldTone; inputs: {}; outputs: {} }]
  >;
}
