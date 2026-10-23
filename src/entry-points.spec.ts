import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/**
 * The rule the package is shaped around: no export may import another export.
 *
 * lodash is the cautionary tale for the cheap version of this — one module
 * pulling in another until importing `debounce` cost the library — and here the
 * stakes are higher than bytes. The three entry points are split by the
 * ENVIRONMENT their code runs in, so a single import across the line does not
 * merely enlarge a bundle, it puts `@angular/core/testing` or `node:fs` on a
 * path an application build can follow. Bundlers are good at removing unused
 * code and bad at removing an import whose module has a side effect they cannot
 * prove absent, and `node:fs` in a browser build is a resolution error rather
 * than dead weight.
 *
 * So the layout enforces it structurally: one directory per entry point, three
 * siblings, and a relative import may not leave its own. The symmetry is the
 * argument — there is no shared folder to be tempted by, and a helper two of
 * them want is duplicated on purpose or moved into the root entry point, where
 * paying for it is a decision somebody makes rather than a consequence nobody
 * sees.
 */
const SRC = resolve(import.meta.dirname);

/** Directory under `src/` to the subpath it is published as. */
const ENTRY_POINTS: Readonly<Record<string, string>> = {
  root: 'ngtrue',
  testing: 'ngtrue/testing',
  node: 'ngtrue/node',
};

/** Package specifiers only one entry point may name, and the reason each is confined. */
const CONFINED: readonly { readonly pattern: RegExp; readonly entryPoint: string; readonly why: string }[] = [
  {
    pattern: /^@angular\/core\/testing$/,
    entryPoint: 'testing',
    why: 'the test harness must never be reachable from an application bundle',
  },
  {
    pattern: /^node:/,
    entryPoint: 'node',
    why: 'a Node builtin does not resolve in a browser build at all',
  },
];

describe('the entry points', () => {
  const files = sources(SRC);

  it('has a directory for each published subpath and nothing else', () => {
    const directories = readdirSync(SRC, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .sort();

    expect(directories).toEqual(Object.keys(ENTRY_POINTS).sort());
  });

  it('is checking every source file, not an empty set', () => {
    // A walker that quietly matched nothing would report every rule below as
    // held. This is the assertion that stops the suite passing on its own bug.
    expect(files.length).toBeGreaterThan(5);
    for (const entryPoint of Object.keys(ENTRY_POINTS)) {
      expect(
        files.some(file => file.startsWith(`${entryPoint}/`)),
        `no file scanned under src/${entryPoint}`,
      ).toBe(true);
    }
  });

  it('never reaches across a boundary with a relative import', () => {
    const crossings: string[] = [];

    for (const file of files) {
      const owner = entryPointOf(file);
      for (const specifier of specifiersIn(join(SRC, file))) {
        if (!specifier.startsWith('.')) continue;
        const target = relative(SRC, resolve(dirname(join(SRC, file)), specifier))
          .split(sep)
          .join(posix.sep);
        const targetOwner = entryPointOf(target);
        if (targetOwner !== owner) {
          crossings.push(`${file} imports '${specifier}', which lands in ${describeOwner(targetOwner)}`);
        }
      }
    }

    expect(crossings).toEqual([]);
  });

  it('never reaches across a boundary by package name either', () => {
    // The relative form is the one people write by accident; this is the one
    // they write on purpose, having decided the rule does not apply to them.
    const crossings: string[] = [];
    const subpaths = Object.values(ENTRY_POINTS);

    for (const file of files) {
      const own = ENTRY_POINTS[entryPointOf(file) ?? ''] ?? null;
      for (const specifier of specifiersIn(join(SRC, file))) {
        if (!subpaths.includes(specifier)) continue;
        if (specifier !== own) crossings.push(`${file} imports '${specifier}'`);
      }
    }

    expect(crossings).toEqual([]);
  });

  it('keeps the environment-specific packages in the entry point named after them', () => {
    const escapes: string[] = [];

    for (const file of files) {
      const owner = entryPointOf(file);
      for (const specifier of specifiersIn(join(SRC, file))) {
        for (const { pattern, entryPoint, why } of CONFINED) {
          if (!pattern.test(specifier)) continue;
          if (owner === entryPoint) continue;
          escapes.push(`${file} imports '${specifier}', which belongs to src/${entryPoint} — ${why}`);
        }
      }
    }

    expect(escapes).toEqual([]);
  });
});

/**
 * What each entry point publishes, read from two places that have to agree.
 *
 * `@since` on a declaration is the claim that it is public, and the barrel is
 * what ships. No other spec imports a barrel — each one imports the module it
 * covers — and typedoc documents the barrels and nothing else, so a check that
 * was tagged and then left out of `index.ts` never reaches the API reference:
 * `docs:check` compares an absent page with an absent page, stays green, and
 * the release goes out without the export. The reverse, an export nobody
 * tagged, is a public name with no version on its reference page.
 *
 * Read with the TypeScript compiler rather than by pattern, for the reason the
 * reference is generated by typedoc: an export a regular expression fails to
 * match is invisible, and two lists missing the same name agree.
 */
describe('the public surface', () => {
  const surfaces = publicSurfaces();
  const surfaceOf = (entryPoint: string): Surface => {
    const surface = surfaces.get(entryPoint);
    if (surface === undefined) throw new Error(`src/${entryPoint}/index.ts was not read as a module`);
    return surface;
  };

  it('is read from every barrel, and finds something on both sides', () => {
    // Two empty lists compare equal. A reader that stopped seeing exports and
    // tags alike — a compiler API change, a barrel the program never loaded —
    // would report every entry point below as consistent.
    for (const entryPoint of Object.keys(ENTRY_POINTS)) surfaceOf(entryPoint);
    const all = [...surfaces.values()];

    expect(all.flatMap(surface => surface.exported)).not.toEqual([]);
    expect(all.flatMap(surface => surface.values)).not.toEqual([]);
    expect(all.flatMap(surface => [...surface.tagged.keys()])).not.toEqual([]);
  });

  for (const [entryPoint, subpath] of Object.entries(ENTRY_POINTS)) {
    it(`${subpath} exports exactly the declarations tagged @since`, () => {
      const { exported, tagged } = surfaceOf(entryPoint);

      expect([
        ...exported
          .filter(name => !tagged.has(name))
          .map(name => `${subpath} exports ${name}, which carries no @since tag`),
        ...[...tagged]
          .filter(([name]) => !exported.includes(name))
          .map(([name, file]) => `src/${file} tags ${name} @since, and ${subpath} does not export it`),
      ]).toEqual([]);
    });

    it(`${subpath} has every value it exports at run time`, async () => {
      // `export { type check }` typechecks, still names `check` as an export,
      // and is erased by the emit: the package ships without the function
      // while the reference keeps a page for it, filed under type aliases.
      // Only loading the barrel shows the difference.
      //
      // `@vite-ignore` because vite rewrites an import with a variable in it
      // into a glob over files matching `./*/index.js`, and there are none: the
      // barrels are `.ts`. Left alone, the runner resolves the `.js` specifier
      // to its source the way it resolves every static import in `src/`.
      const loaded = Object.keys((await import(/* @vite-ignore */ `./${entryPoint}/index.js`)) as object);

      expect(
        surfaceOf(entryPoint)
          .values.filter(name => !loaded.includes(name))
          .map(name => `${subpath} exports the value ${name}, and it is not there at run time`),
      ).toEqual([]);
    });
  }
});

/** One entry point's public surface, as the compiler sees it. */
interface Surface {
  /** Every name the barrel exports, types included. */
  readonly exported: readonly string[];
  /** The exported names that are values, which have to survive the emit. */
  readonly values: readonly string[];
  /** Each name declared in the entry point with a `@since` tag, to its file, relative to `src/`. */
  readonly tagged: ReadonlyMap<string, string>;
}

/**
 * Every barrel and the modules beside it, in one program built from the
 * repository's own `tsconfig.json`, so a `.js` specifier resolves to its `.ts`
 * source the way `typecheck` resolves it.
 *
 * Tags are read through the compiler too. It reads only the last JSDoc block
 * before a declaration, and so does typedoc: a `@since` in an earlier block is
 * not on the reference page, and is not counted here either.
 */
function publicSurfaces(): ReadonlyMap<string, Surface> {
  const root = resolve(SRC, '..');
  const config = ts.readConfigFile(join(root, 'tsconfig.json'), path => ts.sys.readFile(path));
  if (config.error !== undefined) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const { options } = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const files = sources(SRC);
  const program = ts.createProgram({ rootNames: files.map(file => join(SRC, file)), options });
  const checker = program.getTypeChecker();

  const exportsOf = (file: string): readonly ts.Symbol[] | null => {
    const sourceFile = program.getSourceFile(join(SRC, file));
    const module = sourceFile === undefined ? undefined : checker.getSymbolAtLocation(sourceFile);
    return module === undefined ? null : checker.getExportsOfModule(module);
  };
  const isAlias = (symbol: ts.Symbol): boolean => (symbol.flags & ts.SymbolFlags.Alias) !== 0;
  const target = (symbol: ts.Symbol): ts.Symbol => (isAlias(symbol) ? checker.getAliasedSymbol(symbol) : symbol);

  const surfaces = new Map<string, Surface>();
  for (const entryPoint of Object.keys(ENTRY_POINTS)) {
    const exported = exportsOf(`${entryPoint}/index.ts`);
    if (exported === null) continue;

    // Declarations only, each counted in the file that makes it. A re-export
    // is an alias whose tags are its target's, so counting one would let the
    // barrel tag everything it re-exports and agree with itself. Skipping every
    // alias goes too far the other way: `export { check }` naming a function in
    // the same file is an alias too, and typedoc prints that function's tags.
    const tagged = new Map<string, string>();
    for (const file of files) {
      if (entryPointOf(file) !== entryPoint) continue;
      const sourceFile = program.getSourceFile(join(SRC, file));
      for (const symbol of exportsOf(file) ?? []) {
        const declared = target(symbol);
        if (declared.declarations?.some(declaration => declaration.getSourceFile() === sourceFile) !== true) continue;
        if (declared.getJsDocTags(checker).some(tag => tag.name === 'since')) tagged.set(symbol.name, file);
      }
    }

    surfaces.set(entryPoint, {
      exported: exported.map(symbol => symbol.name).sort(),
      values: exported
        .filter(symbol => (target(symbol).flags & ts.SymbolFlags.Value) !== 0)
        .map(symbol => symbol.name)
        .sort(),
      tagged,
    });
  }
  return surfaces;
}

/** Which entry point a path under `src/` belongs to, or `null` for the repo-level files beside them. */
function entryPointOf(fromSrc: string): string | null {
  const head = fromSrc.split(posix.sep)[0] as string;
  return head in ENTRY_POINTS ? head : null;
}

function describeOwner(owner: string | null): string {
  return owner === null ? 'no entry point at all' : `src/${owner}`;
}

/**
 * The files that SHIP, which is the scope of the rule: specs and fixtures are
 * excluded here for the same reason `tsconfig.build.json` excludes them — no
 * consumer's bundler ever sees them, so what they import cannot leak. This file
 * is one of them, which is why it may open `node:fs` two lines above a check
 * that forbids exactly that outside `src/node`.
 */
function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'fixtures') sources(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      out.push(relative(SRC, full).split(sep).join(posix.sep));
    }
  }
  return out;
}

function specifiersIn(file: string): readonly string[] {
  const source = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1');

  return [
    ...source.matchAll(/\bfrom\s*['"]([^'"\n]+)['"]/g),
    ...source.matchAll(/(?:^|\n)\s*import\s*['"]([^'"\n]+)['"]/g),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"\n]+)['"]/g),
  ].map(match => match[1] as string);
}
