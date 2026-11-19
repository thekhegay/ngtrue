import type { Core } from '@fixture/peer';
import type { Option } from '@fixture/peer/sub';
import type { Row } from './inner.js';
import type { Self } from 'fixture-imports-sound';
import type { Stats } from 'node:fs';

/** Names another package's root and subpath, a Node built-in, and a file of its own that names more. */
export declare function pick(core: typeof Core, option: Option, row: Row, self: Self, stats: Stats): void;
export type { Row };
