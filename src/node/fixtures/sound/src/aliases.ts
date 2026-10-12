// Specifiers in an import position that name no package: a source-root alias
// in both spellings, a bundler's virtual module and a subpath import. The
// `rxjs` import among them is the control — it shows the file was read.
import type { Helper } from '@/helper';
import type { Other } from '~/helper';
import icons from 'virtual:icons';
import { internal } from '#internal';
import { of } from 'rxjs';

export const aliased = [icons, internal, of] as const;
export type Aliased = Helper | Other;
