import type { Core } from '@fixture/peer';
import type { Option } from '@fixture/peer/sub';
import type { Row } from './inner.js';
import type { Stats } from 'node:fs';

/** The sound package's declarations, with one import it cannot be consumed with. */
export declare function pick(core: typeof Core, option: Option, row: Row, stats: Stats): void;
export type { Row };
