import { readFileSync, readdirSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, posix, relative, resolve, sep } from 'node:path';

import { importSpecifiers } from './import-specifiers.js';
import { dependencyRecord, readManifest } from './manifest.js';

/** Options for {@link peerDependencyMismatches}. */
/** @since 0.1.0 */
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
   * Prefer this to restating the list in {@link exclude}. The compiler already
   * knows what is left out of the package, and a second copy means two lists
   * that agree until someone adds a third kind of test file to one of them.
   */
  readonly tsconfig?: string;
  /**
   * Patterns for files to leave out, relative to `packageDir`. `*` matches
   * within a path segment, `**` across segments, and a pattern that names a
   * directory leaves out everything under it — the reading TypeScript gives
   * its own `exclude`.
   *
   * **With `tsconfig`, these are added to its list**, and that is what they are
   * for there: a subtree that ships and runs inside somebody else's program.
   * Schematics are the case that needed it. The Angular CLI runs them and
   * brings `@angular-devkit/schematics` and `@schematics/angular` itself, so a
   * library imports both from `schematics/` and declares neither — on ngwr
   * those were two of this check's eleven findings, and its own spec had
   * skipped the directory for exactly that reason (`SKIP = ['schematics',
   * 'mcp']`, ngwr faf216cd). The build tsconfig cannot say so, because the
   * files are not left out of the package; they are left out of this question.
   * `exclude: ['schematics']` beside `tsconfig` says it.
   *
   * **Without `tsconfig`, they replace the default list** — specs, tests,
   * declaration files and fixtures — so a caller who passes them owns the whole
   * list.
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
 * By lexing the source rather than parsing it. Comments, string literals,
 * template text and regular expressions are blanked first, and a string literal
 * counts only when the CODE in front of it is `from`, a bare `import`, or
 * `import(` / `require(` with the literal as the whole first argument —
 * `require` only as a bare identifier, since `this.require('a')` is somebody's
 * method. Not a parser, because this runs against `.ts` that may use syntax the
 * installed TypeScript does not know yet and a scanner that throws on a file is
 * worse than one that is approximate; and not the scanner the compiler offers
 * for this, `ts.preProcessFile`, which reports `this.require('a')` as an import.
 *
 * The first version matched the raw text with comments stripped, and on ngwr's
 * `projects/lib` ten of its eleven findings were wrong. Eight were TEXT: a
 * template literal printing `from "${edge.from}"`, schematics writing
 * `` `import { ${symbol} } from '${subpath}';` `` into a consumer's file, a
 * `getAttribute('data-from'), getAttribute('data-to')` whose quotes paired
 * across the comma, and a harness method named `require`. The other two were
 * the Angular CLI's own packages, which is what `exclude` beside `tsconfig` is
 * for. The eleventh — `tslib` declared and imported by nothing, in the source
 * or in the built output — was true, and is still reported.
 *
 * What it cannot see is a specifier that is not a literal — a computed
 * `import(name)`, `require(base + '/x')`, a template literal with a
 * substitution. Those are rare in library code and invisible here, so a package
 * reached only that way has to be added by hand or listed in `ignore`. Nor does
 * it know which imports a build keeps: an import used only as a type still
 * counts, though it is erased from the JavaScript, and whether the declarations
 * a consumer installs still name that package depends on whether the type
 * reaches the public surface — which this does not look at. A module
 * augmentation, `declare module 'pkg' { … }`, is not counted either.
 *
 * A lexer has to guess whether a `/` divides or opens a regular expression,
 * and a wrong guess is not always local: through a template literal it can
 * lose the imports after it and read a later template's text as code. The
 * guesses are TypeScript-aware — `size()! / 2` divides, a pattern after
 * `if (…)` is a pattern — and what is left are shapes library code does not
 * write: a variable named `of` before a division, `{} / 2`, a pattern straight
 * after `for await (…)`, and a line of JSX text spelling a whole import.
 *
 * Skipped: relative and absolute paths, subpath imports (`#internal`), anything
 * with a scheme (`node:fs`, `data:…`, a bundler's `virtual:…`), bare Node
 * builtins, the package's own name, and a specifier that cannot be a package
 * name at all — whitespace, quotes, `${`, a path alias such as `@/x` or `~/x`.
 * That last filter is ngwr's (faf216cd) and stays behind the lexer on purpose:
 * text the lexer ever takes for code has to spell a plausible package name to
 * reach a finding, which `${edge.from}` and `), path.getAttribute(` never do.
 * An alias that does look like a package — a tsconfig `paths` entry such as
 * `@app/*` — is read as one, because `paths` is not read; list it in `ignore`.
 *
 * ## A scan that read nothing is a finding
 *
 * When every file under `sourceDir` is excluded, or none is TypeScript, the
 * answer is one sentence saying so and nothing else. An empty source set would
 * otherwise return `[]` for a package that declares nothing — a pass on a
 * question that was never asked — or report every declared dependency as
 * unused, which blames the manifest for the configuration.
 *
 * @since 0.1.0
 */
export function peerDependencyMismatches(options: PeerDependencyMismatchesOptions): readonly string[] {
  const packageDir = resolve(options.packageDir);
  const manifest = readManifest(packageDir);
  const sourceDir = resolve(packageDir, options.sourceDir ?? 'src');

  const excluded = matcher(
    options.tsconfig === undefined
      ? (options.exclude ?? DEFAULT_EXCLUDE)
      : [...excludeFrom(packageDir, options.tsconfig), ...(options.exclude ?? [])],
  );
  const ignored = new Set(options.ignore ?? []);
  const self = typeof manifest.name === 'string' ? manifest.name : null;

  const scanned = sources(sourceDir, packageDir, excluded);
  if (scanned.length === 0) {
    return [
      `no shipped source was read: every TypeScript file under ${relative(packageDir, sourceDir) || '.'} is excluded, ` +
        'or there is none, so nothing was checked.',
    ];
  }

  const imported = new Map<string, string[]>();
  for (const file of scanned) {
    for (const specifier of importSpecifiers(readFileSync(join(packageDir, file), 'utf8'))) {
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

/** A specifier with a scheme is a URL — `node:fs`, `data:…`, a bundler's `virtual:…` — and no package. */
const SCHEME = /^[a-z][a-z\d+.-]*:/i;

/**
 * A package name, scoped or not, and then any subpath. Anything else in an
 * import position is an alias or a misread, and neither is a dependency.
 */
const SPECIFIER = /^(?:@[a-z\d~-][\w.~-]*\/)?[a-z\d~-][\w.~-]*(?:\/[^\s'"`\\{}]*)?$/i;

/** `@scope/name/deep` and `name/deep` to the package they belong to. */
function packageOf(specifier: string): string | null {
  if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#')) return null;
  // `~/` is a source-root alias in several build tools, and npm has not
  // accepted `~` in a new package name.
  if (specifier.startsWith('~/')) return null;
  if (SCHEME.test(specifier) || !SPECIFIER.test(specifier)) return null;
  const parts = specifier.split('/');
  const name = specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] as string);
  return BUILTINS.has(name) ? null : name;
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
 *
 * A match may end at a `/` as well as at the end of the path, because that is
 * how TypeScript reads `exclude`: `"schematics"` leaves out the directory and
 * everything in it. Anchoring at the end alone made that pattern match only a
 * FILE called `schematics`, so the obvious way to write the exclusion did
 * nothing and said nothing. A leading `./` is dropped for the same reason —
 * TypeScript accepts it, and the paths compared here never carry one.
 */
function matcher(patterns: readonly string[]): (file: string) => boolean {
  const expressions = patterns.map(pattern => {
    const source = pattern.replace(/^\.\//, '').replace(/\*\*\/|\*\*|\*|[.+?^${}()|[\]\\]/g, token => {
      if (token === '**/') return '(?:.*/)?';
      if (token === '**') return '.*';
      if (token === '*') return '[^/]*';
      return `\\${token}`;
    });
    return new RegExp(`^${source}(?:$|/)`);
  });
  return (file: string) => expressions.some(expression => expression.test(file));
}
