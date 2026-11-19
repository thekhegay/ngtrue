import * as i0 from '@angular/core';
import * as i1 from './index.js';
import * as i2 from 'fixture-hostdirs-sound';
import { FieldBase } from './index.js';

/** Applies `FieldIdentity` as a host directive, through a relative import. */
export declare class FormField {
  static ɵfac: i0.ɵɵFactoryDeclaration<FormField, never>;
  static ɵcmp: i0.ɵɵComponentDeclaration<
    FormField,
    'x-form-field',
    never,
    {},
    {},
    never,
    never,
    true,
    [{ directive: typeof i1.FieldIdentity; inputs: {}; outputs: {} }]
  >;
}
/** Applies nothing itself and inherits `FieldTone` from `FieldBase`. */
export declare class TextField extends FieldBase {
  static ɵfac: i0.ɵɵFactoryDeclaration<TextField, never>;
  static ɵdir: i0.ɵɵDirectiveDeclaration<TextField, 'x-text-field', never, {}, {}, never, never, true, never>;
}
/** Applies `FieldHint` through a bare specifier, which is how the compiler writes a reference across entry points. `./form-field` does not export it, and the root it names does. */
export declare class Badge {
  static ɵfac: i0.ɵɵFactoryDeclaration<Badge, never>;
  static ɵdir: i0.ɵɵDirectiveDeclaration<
    Badge,
    'x-badge',
    never,
    {},
    {},
    never,
    never,
    true,
    [{ directive: typeof i2.FieldHint; inputs: {}; outputs: {} }]
  >;
}
/** Applies a directive that is not its package's: nothing here judges it. */
export declare class Outside {
  static ɵfac: i0.ɵɵFactoryDeclaration<Outside, never>;
  static ɵdir: i0.ɵɵDirectiveDeclaration<
    Outside,
    'x-outside',
    never,
    {},
    {},
    never,
    never,
    true,
    [{ directive: typeof i0.NgModel; inputs: {}; outputs: {} }]
  >;
}

export { FieldBase, FieldIdentity, FieldTone } from './index.js';
