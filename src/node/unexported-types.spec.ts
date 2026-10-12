import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { FIXTURES } from './fixtures/paths.js';
import { unexportedTypes } from './unexported-types.js';

/**
 * The broken package's findings, in the order the check reports them — one
 * per KIND of reference it reads (a function parameter, an `import('…')` type,
 * an `extends` clause, a property, a method parameter, an `@internal` type, a
 * `typeof` query, a `typeof` of a property), so a walk that stopped reading any
 * one of them loses a line here instead of passing.
 */
const BROKEN = [
  'fixture-unexported-broken: createBtn names BtnOptions, which no subpath exports.',
  'fixture-unexported-broken: pressAll names PressEvent, which no subpath exports.',
  'fixture-unexported-broken: Btn extends BtnBase, which no subpath exports.',
  'fixture-unexported-broken: Btn.shape names BtnShape, which no subpath exports.',
  'fixture-unexported-broken: Btn.press names PressEvent, which no subpath exports.',
  'fixture-unexported-broken: Btn.register names Registration, which no subpath exports — ' +
    'Registration is tagged @internal and Btn.register is not.',
  'fixture-unexported-broken: BtnPreset names PRESETS, which no subpath exports.',
  'fixture-unexported-broken: DEFAULT_SHAPE names DEFAULTS, which no subpath exports.',
];

/** What a run that read no declaration file says instead of returning `[]`. */
const NOTHING_READ =
  'no subpath was read — each one is blocked, a stylesheet or data file, a wildcard, or does not load ' +
  'as declarations under bundler — so there were no signatures to check.';

const file = (dir: string, path: string) => readFileSync(`${dir}/${path}`, 'utf8');

describe('unexportedTypes', () => {
  it('finds nothing wrong with a package that exports every type its signatures name', async () => {
    // Meaningful only beside the broken package: the two share every
    // declaration byte for byte and differ in the re-export lines alone, so
    // this empty array is the fix and not an empty read. (An empty read is
    // reported — see the package that exports nothing, below.) It also has a
    // `sass`-only subpath, which would appear here as "did not load" if a
    // stylesheet were mistaken for code. The assertions before it are what
    // make "byte for byte" a fact rather than a comment.
    const sound = file(FIXTURES.unexportedSound, 'dist/index.d.ts');
    const broken = file(FIXTURES.unexportedBroken, 'dist/index.d.ts');
    expect(file(FIXTURES.unexportedSound, 'dist/types.d.ts')).toBe(file(FIXTURES.unexportedBroken, 'dist/types.d.ts'));
    expect(sound.slice(0, broken.length)).toBe(broken);
    // `[''].filter(…)` keeps the empty string, so a sound copy that added
    // nothing fails here too rather than passing on zero lines.
    expect(
      sound
        .slice(broken.length)
        .trim()
        .split('\n')
        .filter(line => !line.startsWith('export ')),
    ).toEqual([]);

    expect(await unexportedTypes({ packageDir: FIXTURES.unexportedSound })).toEqual([]);
  });

  it('names every public signature that uses a type no subpath exports, and how it uses it', async () => {
    expect(await unexportedTypes({ packageDir: FIXTURES.unexportedBroken })).toEqual(BROKEN);
  });

  it('counts what a sibling subpath exports, which a one-entry-point check would not', async () => {
    // The sibling package ships the broken package's `index.d.ts` unchanged and
    // adds a `./types` subpath re-exporting every name but `PressEvent`. Two
    // findings, both `PressEvent`, rather than eight: the rest are exported —
    // just not by `.`.
    const index = (dir: string) => readFileSync(`${dir}/dist/index.d.ts`, 'utf8');
    expect(index(FIXTURES.unexportedSibling)).toBe(index(FIXTURES.unexportedBroken));

    expect(await unexportedTypes({ packageDir: FIXTURES.unexportedSibling })).toEqual([
      'fixture-unexported-sibling: pressAll names PressEvent, which no subpath exports.',
      'fixture-unexported-sibling: Btn.press names PressEvent, which no subpath exports.',
    ]);
  });

  it('skips what a consumer is not promised, and still reads the rest', async () => {
    // `Hidden` is named by a `#private`, `private`, `protected`, `ɵ`-prefixed
    // and `@internal` member, by an `@internal` class, by a `ɵ`-prefixed class
    // and under `keyof`; `Shape` only by `implements`; the `@internal`
    // `PanelBase` only by `extends`; a type parameter and a `declare global`
    // interface are named too. `Label` is named by one public
    // member — the line that proves the class was walked at all, so the
    // absence of every other line is a skip and not a miss.
    expect(await unexportedTypes({ packageDir: FIXTURES.unexportedPrivate })).toEqual([
      'fixture-unexported-private: Panel.label names Label, which no subpath exports.',
    ]);
  });

  it('reports a package with nothing to read rather than passing it', async () => {
    // It exports a `ɵ`-prefixed constant and a namespace — `export * as` —
    // holding one `@internal` function. Every one of those is skipped, so no
    // signature is read; the namespace itself is a container, and counting it
    // as read is how this came back `[]`.
    expect(await unexportedTypes({ packageDir: FIXTURES.unexportedEmpty })).toEqual([
      "the subpaths that loaded export nothing this check reads — no declaration of the package's own that " +
        'is not `@internal` or `ɵ`-prefixed — so there were no signatures to read.',
    ]);
  });

  it('names every signature whose type the package does not ship at all', async () => {
    // The sound package's `index.d.ts`, byte for byte, beside a build that
    // stopped emitting `types.d.ts` and kept `types.js`. The subpath resolves,
    // so `unresolvableTypes` is satisfied; every name from the missing file is
    // the error type, which a consumer under `skipLibCheck` reads as `any`.
    // Skipping a name that resolves to nothing is what returned `[]` here —
    // the sound package's answer, for a package missing a file.
    expect(file(FIXTURES.unexportedDangling, 'dist/index.d.ts')).toBe(
      file(FIXTURES.unexportedSound, 'dist/index.d.ts'),
    );
    expect(existsSync(`${FIXTURES.unexportedDangling}/dist/types.d.ts`)).toBe(false);

    const missing = (owner: string, verb: string, name: string) =>
      `fixture-unexported-dangling: ${owner} ${verb} ${name}, which does not resolve — './types.js' leads to no declaration file.`;
    expect(await unexportedTypes({ packageDir: FIXTURES.unexportedDangling })).toEqual([
      missing('createBtn', 'names', 'BtnOptions'),
      missing('pressAll', 'names', 'PressEvent'),
      missing('Btn', 'extends', 'BtnBase'),
      missing('Btn.shape', 'names', 'BtnShape'),
      missing('Btn.press', 'names', 'PressEvent'),
      missing('Btn.register', 'names', 'Registration'),
      missing('BtnPreset', 'names', 'PRESETS'),
      missing('DEFAULT_SHAPE', 'names', 'DEFAULTS.shape'),
    ]);
  });

  it('names each signature whose type a stale declaration file no longer has', async () => {
    // Each declaration file is from a different build and names something its
    // neighbour did not have yet: `index.d.ts` reaches `types` by a subpath of
    // the package's own name, `testing.d.ts` reaches the root by the name
    // itself — the two ways a bundled entry point imports another. The files
    // are there and the names are not, and `BtnShape` and `Btn` beside them
    // resolve, so each line is about one name rather than one file.
    expect(await unexportedTypes({ packageDir: FIXTURES.unexportedStale })).toEqual([
      'fixture-unexported-stale: Btn.press names PressEvent, which does not resolve — ' +
        "'fixture-unexported-stale/types' exports nothing by that name.",
      'fixture-unexported-stale/testing: BtnHarness.handle names BtnHandle, which does not resolve — ' +
        "'fixture-unexported-stale' exports nothing by that name.",
    ]);
  });

  it('cannot be told by `ignore` to exempt a name that does not resolve', async () => {
    const problems = await unexportedTypes({ packageDir: FIXTURES.unexportedDangling, ignore: ['BtnShape'] });

    expect(problems).toContain(
      "fixture-unexported-dangling: Btn.shape names BtnShape, which does not resolve — './types.js' leads to no declaration file.",
    );
    expect(problems.at(-1)).toBe(
      'ignore lists "BtnShape", and no public signature names an unexported declaration by that name — ' +
        'the entry exempts nothing.',
    );
  });

  describe('on subpaths it cannot read', () => {
    it('reports a wildcard as unread, since its exports go uncounted', async () => {
      const problems = await unexportedTypes({ packageDir: FIXTURES.broken });

      expect(problems).toContain(
        'exports["./locales/*"] is a wildcard and was not read — nothing it exports was counted, so a type ' +
          'exported only through it is reported as exported by no subpath. List its subpaths literally, ' +
          'or acknowledge it in `ignore`.',
      );
    });

    it('reports each subpath that does not load as declarations, and reads nothing else', async () => {
      const problems = await unexportedTypes({ packageDir: FIXTURES.broken });
      const unloaded = (specifier: string) =>
        `${specifier} did not load as declarations under bundler, so nothing it exports was counted or read. ` +
        '`unresolvableTypes` says why.';

      // `.` has no `types` condition, `./gone` points at nothing, `./folder` at
      // a directory, `./absolute` at a target Node rejects, and `./theme` lands
      // a TypeScript import on the `.js` beside its stylesheet. None loads, so
      // the run read nothing, and says that last.
      expect(problems).toEqual([
        expect.stringContaining('exports["./locales/*"] is a wildcard'),
        unloaded('@fixture/broken'),
        unloaded('@fixture/broken/absolute'),
        unloaded('@fixture/broken/folder'),
        unloaded('@fixture/broken/gone'),
        unloaded('@fixture/broken/theme'),
        NOTHING_READ,
      ]);
    });

    it('still reads what does load, and counts nothing a wildcard exports', async () => {
      // `Locale` is exported only by `./locales/*`, so the finding about it is
      // the limit the wildcard line warns of — present, not hidden.
      expect(await unexportedTypes({ packageDir: FIXTURES.unexportedWildcard })).toEqual([
        expect.stringContaining('exports["./locales/*"] is a wildcard'),
        'fixture-unexported-wildcard/legacy did not load as declarations under bundler, so nothing it exports ' +
          'was counted or read. `unresolvableTypes` says why.',
        'fixture-unexported-wildcard: setLocale names Locale, which no subpath exports.',
      ]);
    });
  });

  describe('ignore', () => {
    it('exempts a declaration by the name a finding prints', async () => {
      const problems = await unexportedTypes({
        packageDir: FIXTURES.unexportedBroken,
        ignore: ['BtnBase', 'Registration'],
      });

      expect(problems).toEqual(
        BROKEN.filter(problem => !problem.includes(' BtnBase,') && !problem.includes(' Registration,')),
      );
    });

    it('acknowledges a subpath it cannot read, and goes on reading the rest', async () => {
      // The finding that survives is what shows `.` was read: acknowledging
      // the other two excused their lines and nothing else. It also shows that
      // acknowledging a wildcard does not count what it exports.
      const problems = await unexportedTypes({
        packageDir: FIXTURES.unexportedWildcard,
        ignore: ['./locales/*', './legacy'],
      });

      expect(problems).toEqual(['fixture-unexported-wildcard: setLocale names Locale, which no subpath exports.']);
    });

    it('does not let acknowledging every subpath turn reading nothing into a pass', async () => {
      // Each line about a subpath is excused, and what is left is still a run
      // that opened no declaration file. `[]` here would be a vacuous pass.
      const problems = await unexportedTypes({
        packageDir: FIXTURES.broken,
        ignore: ['./locales/*', './gone', './folder', './absolute', './theme', '.'],
      });

      expect(problems).toEqual([NOTHING_READ]);
    });

    it('reports an entry that exempts nothing, because the list is a claim about the package', async () => {
      const problems = await unexportedTypes({
        packageDir: FIXTURES.unexportedSound,
        ignore: ['BtnShape', './types', '.'],
      });

      expect(problems).toEqual([
        'ignore lists "BtnShape", and no public signature names an unexported declaration by that name — ' +
          'the entry exempts nothing.',
        'ignore lists "./types", which is not a subpath this check skipped — the entry exempts nothing.',
        'ignore lists ".", which is not a subpath this check skipped — the entry exempts nothing.',
      ]);
    });
  });

  it('answers about the manifest when there is no `exports` to read a surface from', async () => {
    const problems = await unexportedTypes({ packageDir: FIXTURES.noExports });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('declares no `exports`');
  });

  it('answers about the manifest when there is no name to import by', async () => {
    const problems = await unexportedTypes({ packageDir: FIXTURES.nameless });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('no "name"');
  });
});
