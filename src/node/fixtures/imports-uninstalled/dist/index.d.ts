import type { Core } from '@fixture/peer';
import type { Gone } from '@fixture/absent/deep';
import type { Other } from '@fixture/absent';

/** Imports a package that is installed, and one that is not. */
export declare function pick(core: typeof Core, gone: Gone, other: Other): void;
