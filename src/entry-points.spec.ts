import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';

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
