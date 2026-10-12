import { describe, expect, it } from 'vitest';

import { FIXTURES } from './fixtures/paths.js';
import { peerDependencyMismatches } from './peer-dependency-mismatches.js';

/** Everything `broken/` should report under the default exclusions, in the order the check sorts it. */
const BROKEN = [
  '@angular-devkit/schematics is imported by src/schematics/index.ts and is declared nowhere in the manifest.',
  'left-pad is imported by src/index.ts and is declared nowhere in the manifest.',
  'undeclared-dynamic is imported by src/text.ts and is declared nowhere in the manifest.',
  'undeclared-re-export is imported by src/text.ts and is declared nowhere in the manifest.',
  'undeclared-require is imported by src/legacy.cts and is declared nowhere in the manifest.',
  'undeclared-side-effect is imported by src/text.ts and is declared nowhere in the manifest.',
  'never-imported is declared as a peer dependency and no shipped source imports it.',
];

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

  describe('text that spells an import', () => {
    it('reads none of it as one', () => {
      // `sound/src/text.ts` holds every shape that was a false finding on ngwr:
      // `from "${…}"` in a template, a generated `… from 'lucide'` line,
      // `getAttribute('data-from'), getAttribute('data-to')` and
      // `this.require('…')`. Scanned alone, it may contribute nothing — and the
      // two unused-dependency findings prove it WAS scanned, since a scan of no
      // file at all answers with a different sentence.
      const problems = peerDependencyMismatches({
        packageDir: FIXTURES.sound,
        exclude: ['src/index.ts', 'src/helper.ts', 'src/aliases.ts', '**/*.spec.ts'],
      });

      expect(problems).toEqual([
        'rxjs is declared as a peer dependency and no shipped source imports it.',
        'tslib is declared as a dependency and no shipped source imports it.',
      ]);
    });

    it('still finds a real import of every form written after it', () => {
      // `broken/src/text.ts` puts the same text, a regular expression full of
      // quotes, a nested template, a division after a non-null assertion and a
      // pattern holding a backtick after `if (…)` in FRONT of a side-effect
      // import, an `export * from` and a dynamic `import()` behind a comment;
      // `legacy.cts` holds the bare `require`. Every one of them is named,
      // and nothing else is — the lexer this replaced lost all three imports
      // in `text.ts` to either of the last two shapes.
      expect(peerDependencyMismatches({ packageDir: FIXTURES.broken })).toEqual(BROKEN);
    });
  });

  it('skips aliases, schemes and subpath imports, which name no package', () => {
    // `sound/src/aliases.ts` imports `@/helper`, `~/helper`, `virtual:icons`
    // and `#internal` beside `rxjs`. Read alone, `rxjs` is found — so the file
    // was read — and none of the others is reported as a package.
    const problems = peerDependencyMismatches({
      packageDir: FIXTURES.sound,
      exclude: ['src/index.ts', 'src/helper.ts', 'src/text.ts', '**/*.spec.ts'],
    });

    expect(problems).toEqual(['tslib is declared as a dependency and no shipped source imports it.']);
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

  describe('`exclude` beside a `tsconfig`', () => {
    it('reports the schematics subtree when only the tsconfig is given, since it ships', () => {
      // The control for the case below: without it, a pass there could mean the
      // subtree was never read.
      const problems = peerDependencyMismatches({ packageDir: FIXTURES.broken, tsconfig: 'tsconfig.build.json' });

      expect(problems).toEqual(BROKEN);
    });

    it('adds to the tsconfig list rather than replacing it', () => {
      // `src/schematics` goes, and the tsconfig's own `src/**/*.spec.ts` stays —
      // `broken/src/index.spec.ts` imports vitest, so a replaced list would put
      // vitest in the findings.
      const problems = peerDependencyMismatches({
        packageDir: FIXTURES.broken,
        tsconfig: 'tsconfig.build.json',
        exclude: ['src/schematics'],
      });

      expect(problems).toEqual(BROKEN.filter(problem => !problem.startsWith('@angular-devkit/schematics')));
    });

    it('reads a bare directory name the way TypeScript does, as everything under it', () => {
      // `"schematics"` in a tsconfig `exclude` leaves out the directory; a
      // matcher anchored at the end of the path matched only a FILE by that
      // name, so the obvious spelling excluded nothing and said nothing.
      // Without a tsconfig the list replaces the default one, so the spec's
      // vitest import is read too, and the whole answer is pinned: a scan that
      // read nothing would also leave the schematics finding out.
      const bare = peerDependencyMismatches({ packageDir: FIXTURES.broken, exclude: ['src/schematics'] });
      const dotted = peerDependencyMismatches({ packageDir: FIXTURES.broken, exclude: ['./src/schematics/**'] });

      const undeclared = BROKEN.filter(problem => problem.includes('declared nowhere'));
      const unused = BROKEN.filter(problem => problem.includes('is declared as'));

      expect(bare).toEqual([
        ...undeclared.filter(problem => !problem.startsWith('@angular-devkit/schematics')),
        'vitest is imported by src/index.spec.ts and is declared nowhere in the manifest.',
        ...unused,
      ]);
      expect(dotted).toEqual(bare);
    });
  });

  it('reports a scan that read no file instead of passing it', () => {
    // `sound/` declares two dependencies, so an empty scan would otherwise
    // blame the manifest for both; a package declaring none would pass.
    expect(peerDependencyMismatches({ packageDir: FIXTURES.sound, exclude: ['src'] })).toEqual([
      'no shipped source was read: every TypeScript file under src is excluded, or there is none, so nothing was checked.',
    ]);
  });

  it('drops both directions for a package named in `ignore`', () => {
    const problems = peerDependencyMismatches({
      packageDir: FIXTURES.broken,
      ignore: [
        '@angular-devkit/schematics',
        'left-pad',
        'undeclared-dynamic',
        'undeclared-re-export',
        'undeclared-require',
        'undeclared-side-effect',
        'never-imported',
      ],
    });

    expect(problems).toEqual([]);
  });
});
