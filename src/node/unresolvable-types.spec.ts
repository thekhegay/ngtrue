import { describe, expect, it } from 'vitest';

import { FIXTURES } from './fixtures/paths.js';
import { unresolvableTypes } from './unresolvable-types.js';

const wildcard = (subpath: string) =>
  `exports["${subpath}"] is a wildcard and was not probed — one sample would say nothing about the rest of ` +
  'the set. Check it by hand, list the subpaths literally, or acknowledge it in `ignore`.';

const stale = (entry: string) =>
  `ignore lists "${entry}", which is not a subpath this check would have reported — the entry exempts nothing.`;

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
    it('does not probe them: TypeScript matches none of the stylesheet conditions', async () => {
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

    it('skips `less` and `css` like the rest, which a real package needed', async () => {
      // `stylesheets-sound/` has ng-zorro-antd's two shapes — `"./*.less"` under
      // `less` alone, and a per-component wildcard under `less` and `style` —
      // and angular-split's `"./theme": { "css": … }`, beside a typed root.
      // Skipping only `sass` and `style` turned them into two wildcard notes and
      // two lines saying `./theme` does not resolve; on the packages themselves
      // that was every one of ng-zorro-antd's 69 lines and both of
      // angular-split's.
      expect(await unresolvableTypes({ packageDir: FIXTURES.stylesheetsSound })).toEqual([]);
    });

    it('probes the same subpaths again once they offer TypeScript a JavaScript target', async () => {
      // `stylesheets-broken/` is the sound package with a `default` beside the
      // stylesheet in `./button/style/*` and in `./theme`. The `less`-only
      // wildcard stays silent; the other two are where a TypeScript import now
      // lands, so the wildcard is unprobed again and `./theme` gets `any`.
      const problems = await unresolvableTypes({ packageDir: FIXTURES.stylesheetsBroken });

      expect(problems).toEqual([
        wildcard('./button/style/*'),
        expect.stringMatching(
          /^fixture-stylesheets-broken\/theme resolves under node16 to .*theme\.js, which is not a/,
        ),
        expect.stringMatching(
          /^fixture-stylesheets-broken\/theme resolves under bundler to .*theme\.js, which is not a/,
        ),
      ]);
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

    expect(problems).toContain(wildcard('./locales/*'));
  });

  it('probes only the modes it is asked for', async () => {
    const both = await unresolvableTypes({ packageDir: FIXTURES.broken });
    const one = await unresolvableTypes({ packageDir: FIXTURES.broken, modes: ['node16'] });

    expect(one.length).toBeLessThan(both.length);
    expect(one.some(problem => problem.includes('bundler'))).toBe(false);
  });

  describe('ignore', () => {
    it('acknowledges a wildcard, and excuses a literal subpath under every mode', async () => {
      // `.` is still probed and still resolves, which is what makes `[]` a pass
      // here rather than a run that checked nothing.
      const problems = await unresolvableTypes({
        packageDir: FIXTURES.stylesheetsBroken,
        ignore: ['./button/style/*', './theme'],
      });

      expect(problems).toEqual([]);
    });

    it('excuses the subpaths it lists and nothing else', async () => {
      const all = await unresolvableTypes({ packageDir: FIXTURES.broken });
      const problems = await unresolvableTypes({ packageDir: FIXTURES.broken, ignore: ['./locales/*', './theme'] });

      // Three lines go — the wildcard, and `./theme` under each mode — and
      // every other finding about `broken/` stays where it was.
      expect(problems).toEqual(
        all.filter(problem => problem !== wildcard('./locales/*') && !problem.startsWith('@fixture/broken/theme ')),
      );
      expect(all.length - problems.length).toBe(3);
    });

    it('reports an entry that exempts nothing, because the list is a claim about the package', async () => {
      // `./*.less` and `./theme` are stylesheets and skipped before anything is
      // reported, `.` resolves under both modes, and `./gone` is not in
      // `exports` at all.
      const problems = await unresolvableTypes({
        packageDir: FIXTURES.stylesheetsSound,
        ignore: ['./*.less', './theme', '.', './gone'],
      });

      expect(problems).toEqual([stale('./*.less'), stale('./theme'), stale('.'), stale('./gone')]);
    });

    it('does not let excusing every subpath turn checking nothing into a pass', async () => {
      // No subpath of `broken/` resolves to declarations. Each line about one
      // is excused, and what is left is still a run in which no types resolved.
      // `[]` here would be a vacuous pass.
      const problems = await unresolvableTypes({
        packageDir: FIXTURES.broken,
        ignore: ['.', './absolute', './folder', './gone', './locales/*', './theme'],
      });

      expect(problems).toEqual([
        'no subpath of @fixture/broken resolved to declarations, and every one that was probed is listed in ' +
          '`ignore`, so nothing was checked.',
      ]);

      // Leave one out and its findings are the answer. The sentence above
      // would be false beside them, as it would be with no `ignore` at all,
      // so it is said only when every probed subpath is listed.
      const partly = await unresolvableTypes({
        packageDir: FIXTURES.broken,
        ignore: ['.', './absolute', './folder', './gone', './locales/*'],
      });

      expect(partly).toEqual([
        expect.stringMatching(/^@fixture\/broken\/theme resolves under node16 to /),
        expect.stringMatching(/^@fixture\/broken\/theme resolves under bundler to /),
      ]);
    });
  });

  it('answers about the manifest when there is no name to import by', async () => {
    const problems = await unresolvableTypes({ packageDir: FIXTURES.nameless });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('no "name"');
  });
});
