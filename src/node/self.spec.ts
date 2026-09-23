import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { peerDependencyMismatches } from './peer-dependency-mismatches.js';
import { unresolvableTypes } from './unresolvable-types.js';
import { unresolvedExports } from './unresolved-exports.js';

/**
 * ngtrue run against ngtrue.
 *
 * Fixtures prove the checks report what they claim to; this proves they are
 * usable on a real package, which is a different question and the one that has
 * historically gone unasked. It is also the cheapest possible guard on the
 * package's own manifest: the three faults these functions exist to catch are
 * exactly the three a release of ngtrue could ship.
 */
const ROOT = join(import.meta.dirname, '../..');

describe('ngtrue, checked by ngtrue', () => {
  beforeAll(() => {
    // Not a skip. These checks are about the BUILT package, and a suite that
    // quietly passed when there was nothing to look at would be green on every
    // run that mattered.
    if (!existsSync(join(ROOT, 'dist'))) {
      throw new Error('ngtrue: run `npm run build` before the tests — these three checks read `dist/`.');
    }
  });

  it('ships every file its `exports` advertises', () => {
    expect(unresolvedExports({ packageDir: ROOT })).toEqual([]);
  });

  it('resolves its types under node16 and under bundler', async () => {
    expect(await unresolvableTypes({ packageDir: ROOT })).toEqual([]);
  });

  it('declares what it imports, and imports what it declares', () => {
    expect(peerDependencyMismatches({ packageDir: ROOT, tsconfig: 'tsconfig.build.json' })).toEqual([]);
  });
});
