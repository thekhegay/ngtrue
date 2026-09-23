import { describe, expect, it } from 'vitest';

import { FIXTURES } from './fixtures/paths.js';
import { peerDependencyMismatches } from './peer-dependency-mismatches.js';

describe('peerDependencyMismatches', () => {
  it('finds nothing wrong with a package that declares what it imports', () => {
    expect(peerDependencyMismatches({ packageDir: FIXTURES.sound })).toEqual([]);
  });

  it('ignores relative paths, `node:` builtins and bare builtins', () => {
    // The sound fixture imports `node:fs` and a sibling module. Either counted
    // as a package would put a finding in the list above, so the pass there is
    // this assertion as much as the other one.
    expect(peerDependencyMismatches({ packageDir: FIXTURES.sound })).toEqual([]);
  });

  it('names a package the source imports and the manifest does not declare', () => {
    const problems = peerDependencyMismatches({ packageDir: FIXTURES.broken });

    expect(problems).toContain('left-pad is imported by src/index.ts and is declared nowhere in the manifest.');
  });

  it('names a peer nobody imports, which is a resolvable constraint over nothing', () => {
    const problems = peerDependencyMismatches({ packageDir: FIXTURES.broken });

    expect(problems).toContain('never-imported is declared as a peer dependency and no shipped source imports it.');
  });

  it('does not count a package named only in a comment', () => {
    // The broken fixture's source mentions `never-imported` in a comment. If
    // comments were scanned, the finding above would disappear — and the check
    // would report a package as used because a docblock warned about it.
    const problems = peerDependencyMismatches({ packageDir: FIXTURES.broken });

    expect(problems.some(problem => problem.startsWith('never-imported is declared'))).toBe(true);
  });

  it('excludes specs by default, so a test-only import is not a missing dependency', () => {
    // `sound/src/index.spec.ts` imports vitest, which is not in its manifest.
    expect(peerDependencyMismatches({ packageDir: FIXTURES.sound })).toEqual([]);
    expect(peerDependencyMismatches({ packageDir: FIXTURES.sound, exclude: ['nothing/**'] })).toContain(
      'vitest is imported by src/index.spec.ts and is declared nowhere in the manifest.',
    );
  });

  it('takes the exclusions from a tsconfig when given one', () => {
    expect(peerDependencyMismatches({ packageDir: FIXTURES.sound, tsconfig: 'tsconfig.build.json' })).toEqual([]);
  });

  it('refuses a tsconfig with no `exclude` rather than reading files that do not ship', () => {
    expect(() =>
      peerDependencyMismatches({ packageDir: FIXTURES.sound, tsconfig: 'tsconfig.everything.json' }),
    ).toThrow(/declares no `exclude`/);
  });

  it('drops both directions for a package named in `ignore`', () => {
    const problems = peerDependencyMismatches({
      packageDir: FIXTURES.broken,
      ignore: ['left-pad', 'never-imported'],
    });

    expect(problems).toEqual([]);
  });
});
