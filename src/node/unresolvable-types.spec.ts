import { describe, expect, it } from 'vitest';

import { FIXTURES } from './fixtures/paths.js';
import { unresolvableTypes } from './unresolvable-types.js';

describe('unresolvableTypes', () => {
  it('finds nothing wrong with a package whose types resolve both ways', async () => {
    expect(await unresolvableTypes({ packageDir: FIXTURES.sound })).toEqual([]);
  });

  it('resolves a scoped name too, which needs the scope directory staged', async () => {
    // `@fixture/broken` cannot be symlinked into `node_modules` without creating
    // `node_modules/@fixture` first. The check below would fail with a
    // filesystem error rather than a finding if that were missed, so this
    // asserts the findings are about the package and not about the probe.
    const problems = await unresolvableTypes({ packageDir: FIXTURES.broken });

    expect(problems.every(problem => !problem.includes('ENOENT'))).toBe(true);
  });

  describe('on a package with no declarations behind a subpath', () => {
    it('names the subpath under both modes', async () => {
      const problems = await unresolvableTypes({ packageDir: FIXTURES.broken });
      const root = problems.filter(problem => problem.startsWith('@fixture/broken '));

      expect(root).toHaveLength(2);
      expect(root.some(problem => problem.includes('node16'))).toBe(true);
      expect(root.some(problem => problem.includes('bundler'))).toBe(true);
    });

    it('says the consumer gets `any`, which is the part that does not announce itself', async () => {
      const problems = await unresolvableTypes({ packageDir: FIXTURES.broken, modes: ['bundler'] });

      expect(problems.some(problem => problem.includes('not a declaration file'))).toBe(true);
    });
  });

  describe('subpaths only a stylesheet compiler can reach', () => {
    it('does not probe them: TypeScript matches neither `sass` nor `style`', async () => {
      // `stylesheets/` exports `.` under `sass` alone. Probed, it would come back
      // as "does not resolve" under both modes — the ten lines ngwr got for its
      // Sass entry points and the twelve `@angular/cdk` got for its prebuilt CSS.
      // Skipped, nothing is left to probe, and that is said rather than passed.
      expect(await unresolvableTypes({ packageDir: FIXTURES.stylesheets })).toEqual([
        'no subpath of fixture-stylesheets was probed: `exports` lists none that is not a wildcard, a ' +
          'stylesheet, `null` or ./package.json, so nothing was checked.',
      ]);
    });

    it('probes the rest of a package that also has them', async () => {
      // `sound/` carries a `sass`-only and a `style`-only subpath beside two
      // typed ones; the typed ones are still probed and still pass.
      expect(await unresolvableTypes({ packageDir: FIXTURES.sound })).toEqual([]);
    });

    it('still probes a subpath with a JavaScript target beside the stylesheet', async () => {
      // `broken/` exports `./theme` as `{ sass, default }` with no `types`: a
      // TypeScript import lands on the `.js`, so the condition beside it does
      // not excuse the missing declarations.
      const problems = await unresolvableTypes({ packageDir: FIXTURES.broken });
      const theme = problems.filter(problem => problem.startsWith('@fixture/broken/theme '));

      expect(theme).toHaveLength(2);
      expect(theme.every(problem => problem.includes('theme.js, which is not a declaration file'))).toBe(true);
      expect(theme.some(problem => problem.includes('under node16'))).toBe(true);
      expect(theme.some(problem => problem.includes('under bundler'))).toBe(true);
    });
  });

  it('reports a package with no `exports` as unprobed rather than passing it', async () => {
    // Not "cannot be imported from TypeScript": without `exports` the package
    // is imported through `main`, so the sentence says what was not done.
    expect(await unresolvableTypes({ packageDir: FIXTURES.noExports })).toEqual([
      'fixture-no-exports has no `exports` map, and only the subpaths one declares are probed, so nothing was checked.',
    ]);
  });

  it('reports a wildcard subpath as unchecked rather than passing it', async () => {
    const problems = await unresolvableTypes({ packageDir: FIXTURES.broken, modes: ['bundler'] });

    expect(problems).toContain(
      'exports["./locales/*"] is a wildcard and was not probed — one sample would say nothing ' +
        'about the rest of the set. Check it by hand, or list the subpaths literally.',
    );
  });

  it('probes only the modes it is asked for', async () => {
    const both = await unresolvableTypes({ packageDir: FIXTURES.broken });
    const one = await unresolvableTypes({ packageDir: FIXTURES.broken, modes: ['node16'] });

    expect(one.length).toBeLessThan(both.length);
    expect(one.some(problem => problem.includes('bundler'))).toBe(false);
  });

  it('answers about the manifest when there is no name to import by', async () => {
    const problems = await unresolvableTypes({ packageDir: FIXTURES.nameless });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('no "name"');
  });
});
