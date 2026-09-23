import { readFileSync, readdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, posix, relative, resolve, sep } from 'node:path';

import { dependencyRecord, readManifest } from './manifest.js';

/** Options for {@link peerDependencyMismatches}. */
export interface PeerDependencyMismatchesOptions {
  /** The directory holding the `package.json` to check. */
  readonly packageDir: string;
  /**
   * The directory holding the sources that SHIP, relative to `packageDir` or
   * absolute. Defaults to `src`.
   */
  readonly sourceDir?: string;
  /**
   * A build tsconfig whose `exclude` says which files do not ship.
   *
   * Prefer this to {@link exclude}. The compiler already knows what is left out
   * of the package, and restating it here means two lists that agree until
   * someone adds a third kind of test file to one of them.
   */
  readonly tsconfig?: string;
  /**
   * Glob-ish patterns for files that do not ship, used when `tsconfig` is not
   * given. `*` matches within a path segment, `**` across segments.
   */
  readonly exclude?: readonly string[];
  /**
   * Packages to leave out of both directions, for the cases neither a manifest
   * nor a source scan can settle — a peer that exists to pin a transitive
   * range, or an import a bundler replaces.
   */
  readonly ignore?: readonly string[];
}

const DEFAULT_EXCLUDE = ['**/*.spec.ts', '**/*.test.ts', '**/*.d.ts', '**/fixtures/**'];

/**
 * Every package a shipped source imports and the manifest does not declare, and
 * every dependency the manifest declares and no shipped source imports, as one
 * sentence each. An empty array is a pass.
 *
 * ```ts
 * it('declares what it imports, and imports what it declares', () => {
 *   expect(peerDependencyMismatches({ packageDir: '.', tsconfig: 'tsconfig.build.json' })).toEqual([]);
 * });
 * ```
 *
 * ## Why both directions
 *
 * **Undeclared** is the one that breaks an install. A bundler resolves whatever
 * is in the workspace's `node_modules`, so an import of a package nobody
 * declared builds green and ships, and the failure lands in a consumer's app as
 * `ERR_MODULE_NOT_FOUND` — but only in an app that does not happen to have the
 * package already. Every framework app has the framework's own packages, which
 * is exactly why they are the ones that go undeclared for years.
 *
 * **Declared and never imported** is quieter and still wrong. A peer range is
 * not a hint, it is a resolvable constraint: npm installs optional peers when
 * they are present and errors on a conflict, so a range on a package the
 * library never loads can fail somebody's install over code that does not run.
 * The usual culprit is a package that used to be imported, and the one after
 * that is a package whose data is passed IN as an argument rather than
 * imported — an icon set, a date library behind an adapter — which feels like a
 * dependency and is not one.
 *
 * ## How imports are found, and what that misses
 *
 * By reading the source text with comments stripped, not by parsing: this runs
 * against `.ts` that may use syntax the running TypeScript does not know yet,
 * and a scanner that throws on a file is worse than one that is approximate.
 * `from '…'`, bare `import '…'`, `import('…')` and `require('…')` are all
 * matched.
 *
 * What that cannot see is a specifier that is not a literal — a computed
 * `import(name)`, or one assembled from variables. Those are rare in library
 * code and invisible here, so a package reached only that way has to be added
 * by hand or listed in `ignore`.
 *
 * Relative paths, `node:` specifiers, bare Node builtins, subpath imports
 * (`#internal`) and the package's own name are all skipped.
 */
export function peerDependencyMismatches(options: PeerDependencyMismatchesOptions): readonly string[] {
  const packageDir = resolve(options.packageDir);
  const manifest = readManifest(packageDir);
  const sourceDir = resolve(packageDir, options.sourceDir ?? 'src');

  const excluded = matcher(
    options.tsconfig === undefined ? (options.exclude ?? DEFAULT_EXCLUDE) : excludeFrom(packageDir, options.tsconfig),
  );
  const ignored = new Set(options.ignore ?? []);
  const self = typeof manifest.name === 'string' ? manifest.name : null;

  const imported = new Map<string, string[]>();
  for (const file of sources(sourceDir, packageDir, excluded)) {
    for (const specifier of specifiersIn(join(packageDir, file))) {
      const name = packageOf(specifier);
      if (name === null || ignored.has(name)) continue;
      if (self !== null && (name === self || specifier.startsWith(`${self}/`))) continue;
      imported.set(name, [...(imported.get(name) ?? []), file]);
    }
  }

  const dependencies = dependencyRecord(manifest.dependencies);
  const peers = dependencyRecord(manifest.peerDependencies);
  const declared = new Set([...Object.keys(dependencies), ...Object.keys(peers)]);

  const problems: string[] = [];

  for (const [name, files] of [...imported].sort()) {
    if (declared.has(name)) continue;
    problems.push(
      `${name} is imported by ${files[0] as string}${files.length > 1 ? ` (and ${String(files.length - 1)} more)` : ''} and is declared nowhere in the manifest.`,
    );
  }

  for (const name of [...declared].sort()) {
    if (imported.has(name) || ignored.has(name)) continue;
    const kind = name in peers ? 'a peer dependency' : 'a dependency';
    problems.push(`${name} is declared as ${kind} and no shipped source imports it.`);
  }

  return problems;
}

const BUILTINS = new Set(builtinModules);

/** `@scope/name/deep` and `name/deep` to the package they belong to. */
function packageOf(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#')) return null;
  if (specifier.startsWith('node:')) return null;
  const parts = specifier.split('/');
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] as string);
  if (BUILTINS.has(name)) return null;
  return name.length === 0 ? null : name;
}

function sources(dir: string, packageDir: string, excluded: (file: string) => boolean, out: string[] = []): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    throw new Error(`ngtrue: no source directory at ${dir}. Pass \`sourceDir\`.`);
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    const fromPackage = relative(packageDir, full).split(sep).join(posix.sep);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') sources(full, packageDir, excluded, out);
    } else if (/\.[cm]?tsx?$/.test(entry.name) && !excluded(fromPackage)) {
      out.push(fromPackage);
    }
  }
  return out;
}

function specifiersIn(file: string): readonly string[] {
  // Comments first. A prose sentence or a JSDoc example ending in "… from '"
  // otherwise reads as an import, and a docblock that names a package it is
  // warning you against would report that package as a dependency.
  const source = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/[^\n]*/g, '$1');

  return [
    ...source.matchAll(/\bfrom\s*['"]([^'"\n]+)['"]/g),
    ...source.matchAll(/(?:^|\n)\s*import\s*['"]([^'"\n]+)['"]/g),
    ...source.matchAll(/\bimport\s*\(\s*['"]([^'"\n]+)['"]/g),
    ...source.matchAll(/\brequire\s*\(\s*['"]([^'"\n]+)['"]/g),
  ].map(match => match[1] as string);
}

function excludeFrom(packageDir: string, tsconfig: string): readonly string[] {
  const path = resolve(packageDir, tsconfig);
  const parsed = JSON.parse(readJsonWithComments(path)) as { exclude?: unknown };
  if (!Array.isArray(parsed.exclude) || parsed.exclude.length === 0) {
    throw new Error(
      `ngtrue: ${path} declares no \`exclude\`, so this check would read the files that do not ship. ` +
        'Either exclude them there, or pass `exclude` here and accept the second copy of the list.',
    );
  }
  return parsed.exclude.filter((pattern): pattern is string => typeof pattern === 'string');
}

/**
 * A tsconfig read as the JSON-with-comments it is in practice.
 *
 * Read by scanning rather than through the TypeScript API, so this stays usable
 * without the optional `typescript` peer — and scanning with a state machine
 * rather than a regular expression, because the regular expression version was
 * wrong in a way that took a failing test to notice: `/\/\*[\s\S]*?\*\//` finds
 * a block comment inside the string `"src/**\/*.spec.ts"`, since `/**\/` IS a
 * block comment when nothing is tracking that it sits between quotes. It turned
 * the exclusion list into `["src*.spec.ts", "srcfixtures/**"]`, which matches no
 * file at all — so the check read every spec in the repository and reported the
 * test runner as an undeclared dependency.
 *
 * Trailing commas are dropped for the same reason the comments are: a tsconfig
 * is allowed them, and a reader that is not is a reader that refuses real files.
 */
function readJsonWithComments(path: string): string {
  const text = readFileSync(path, 'utf8');
  let out = '';
  let index = 0;
  let inString = false;
  let escaped = false;

  while (index < text.length) {
    const char = text[index] as string;

    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      index += 1;
      continue;
    }

    if (char === '"') {
      inString = true;
      out += char;
      index += 1;
      continue;
    }

    if (char === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') index += 1;
      continue;
    }

    if (char === '/' && text[index + 1] === '*') {
      index += 2;
      while (index < text.length && !(text[index] === '*' && text[index + 1] === '/')) index += 1;
      index += 2;
      continue;
    }

    if (char === ',') {
      // Safe to look ahead here precisely because we are outside a string:
      // everything until the next non-space is structure.
      let ahead = index + 1;
      while (ahead < text.length && /\s/.test(text[ahead] as string)) ahead += 1;
      if (text[ahead] === '}' || text[ahead] === ']') {
        index += 1;
        continue;
      }
    }

    out += char;
    index += 1;
  }

  return out;
}

/**
 * tsconfig-style patterns to a predicate.
 *
 * One pass with the alternation ordered longest-first, and not a chain of
 * `replace` calls: `**\/` expands to `(?:.*\/)?`, which contains a `*` of its
 * own, so a later `*` pass would rewrite its own replacement.
 */
function matcher(patterns: readonly string[]): (file: string) => boolean {
  const expressions = patterns.map(pattern => {
    const source = pattern.replace(/\*\*\/|\*\*|\*|[.+?^${}()|[\]\\]/g, token => {
      if (token === '**/') return '(?:.*/)?';
      if (token === '**') return '.*';
      if (token === '*') return '[^/]*';
      return `\\${token}`;
    });
    return new RegExp(`^${source}$`);
  });
  return (file: string) => expressions.some(expression => expression.test(file));
}
