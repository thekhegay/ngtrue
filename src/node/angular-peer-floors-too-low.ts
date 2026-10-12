import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';

import { dependencyRecord, exportTargets, readManifest } from './manifest.js';

/**
 * Options for {@link angularPeerFloorsTooLow}.
 *
 * @since 0.2.0
 */
export interface AngularPeerFloorsTooLowOptions {
  /**
   * The directory holding the `package.json` to check — the BUILT package, the
   * one that would be packed. The declarations this reads exist only in the
   * compiled output, so pointed at a source tree it reads nothing, and says so.
   */
  readonly packageDir: string;
}

/**
 * Every way the `@angular/core` peer range admits an Angular whose linker will
 * refuse the package's compiled output, as one sentence each. An empty array is
 * a pass.
 *
 * ```ts
 * it('admits no Angular that cannot link it', async () => {
 *   expect(await angularPeerFloorsTooLow({ packageDir: 'dist' })).toEqual([]);
 * });
 * ```
 *
 * A library is published in partial-compilation mode: every component,
 * directive, pipe, injectable and service is shipped as a `ɵɵngDeclare*` call
 * that the CONSUMER's build links into a definition. Each call carries the
 * oldest linker that can read it, `minVersion`, and the version that wrote it.
 * The linker in `@angular/compiler-cli` compares that `minVersion` with its own
 * version and, below it, throws "This application depends upon a library
 * published using Angular version X, which requires Angular version Y or newer
 * to work correctly" — at the consumer's `ng build`, about a package the
 * consumer did not write, under a peer range that told npm the install was
 * fine.
 *
 * So the check is that condition, not an estimate of it. It collects every
 * declaration in the JavaScript the `exports` map reaches, takes the highest
 * `minVersion`, and compares it with the lowest version the `@angular/core`
 * peer range admits. Both sides lose their prerelease first, because the
 * linker's `getRange` strips it from both: a declaration needing
 * `22.0.0-next.3` links on `22.0.0-next.0`, which plain semver would call
 * older. The lowest admitted version is the only one worth asking about,
 * because the linker accepts everything above the first version that accepts.
 *
 * ## Where the question came from
 *
 * Other libraries' users, filing the linker's message against a range that
 * promised otherwise — the range written for the Angular the library started
 * on, the build moved to a newer one:
 *
 * - dmacfarlane/angular-mentions#238, "Incorrect peer dependency range": a
 *   peer of `>=7.2.0` over declarations needing 14.0.0
 *   (https://github.com/dmacfarlane/angular-mentions/issues/238), and #244, an
 *   Angular 12 app hitting the same 14.0.0 component
 *   (https://github.com/dmacfarlane/angular-mentions/issues/244).
 * - zefoy/ngx-color-picker#317, an Angular 13 app and a directive declaring
 *   14.0.0 (https://github.com/zefoy/ngx-color-picker/issues/317).
 * - gund/ng-dynamic-component#473, the same against an Angular 13 build
 *   (https://github.com/gund/ng-dynamic-component/issues/473).
 *
 * Every one of those builds passed whatever the library's own CI ran, because
 * nothing on the publishing side compares the two numbers: the refusal happens
 * only in a consumer's build, on an Angular the library's repository no longer
 * installs.
 *
 * ## What it reads, and how
 *
 * Every `exports` target that names JavaScript (`.js`, `.mjs`, `.cjs`), under
 * every condition, with wildcard subpaths expanded against the files on disk —
 * then every file those reach through a relative import, which is where a
 * bundler puts shared chunks. Static, re-exported and dynamic imports alike:
 * `@angular/build:library` gives the dependencies of a `@defer` block a chunk
 * that only `import()` reaches, and the declaration that sets the floor can be
 * the one in it. A file that imports another subpath by the package's own name
 * needs no following, because that subpath is a target and is read anyway. A
 * target that does not exist is skipped: no linker will see what is not there,
 * and {@link unresolvedExports} is the check whose subject that is.
 *
 * Declarations are read as TEXT, matching the two keys the compiler writes
 * first in every call — `minVersion`, then `version`, as string literals, on
 * one line or across several. Text rather than a parse because a parser would
 * have to accept whatever syntax the build emitted, and the compiler's output
 * is regular enough that what does not match it is better reported than
 * guessed at. Three consequences, stated rather than fixed: a declaration
 * spelled out inside a string or a comment is read as if it were code, which
 * can only add a finding and never hide one; a call whose callee is a computed
 * member such as `i0["ɵɵngDeclareComponent"]`, or sits in parentheses, is not
 * matched, which a linker would read and no Angular package builder emits; and
 * a chunk loaded through a computed specifier is not followed, which bundlers
 * do not emit for their own chunks.
 *
 * ## What it reports instead of passing
 *
 * - **A declaration it found and could not read.** Its keys in another order,
 *   or a `minVersion` that is not a version. The linker reads the first through
 *   an AST and may be fine, but the one unread declaration could be the one
 *   needing the newest Angular.
 * - **No declarations at all.** A full-compilation build, a package with no
 *   Angular code in it, or declaration names a bundler escaped as `\u0275` —
 *   which the linker would not find either, since it too looks for the literal
 *   name. There is no `minVersion` to hold the range to, and an empty list
 *   would read as a range that fits.
 * - **Nothing to read.** No `exports`, or JavaScript targets that do not exist
 *   (a source tree checked by mistake for the built package).
 * - **No `@angular/core` peer**, a range semver cannot read (a `workspace:`
 *   protocol checked before publishing rewrites it), or a range nothing
 *   satisfies.
 *
 * ## What a pass does not mean
 *
 * **A pass is not "supported".** It says that every Angular the range admits
 * can LINK the package, which is a narrower thing than working:
 *
 * - **Types are out of scope.** The `.d.ts` files reference the `@angular/core`
 *   types of the version that built them, and an older consumer's compiler can
 *   fail on those with no linker involved.
 * - **Runtime APIs are out of scope.** A declaration's `minVersion` is about
 *   the declaration's FORMAT. Code that calls an API added after that version
 *   links fine and throws at runtime, and only a test run on the floor version
 *   finds it.
 * - **Angular's own policy is out of scope, and it is stricter.** "Ensuring
 *   library version compatibility" on angular.dev asks for an application
 *   built with the same Angular as each of its libraries or a later one, and
 *   does not support an earlier one. A range reaching below the version that
 *   built the package can pass here and still be a range Angular does not
 *   stand behind; a library that wants Angular's guarantee sets its floor to
 *   its build version, which this check then passes as well.
 * - **The linker's version is the consumer's `@angular/compiler-cli`**, which
 *   Angular releases in lockstep with `@angular/core`. An install that mixes
 *   versions is not something a library's range can describe.
 *
 * **`semver` has to be installed.** It is an optional peer dependency of
 * ngtrue, and this is the only function that needs it: reading the lowest
 * version out of a range like `^14.2.0 || >=15.0.0-rc.0` is range arithmetic,
 * and an approximation of it would agree with the real thing on every range
 * that was already simple.
 *
 * @since 0.2.0
 */
export async function angularPeerFloorsTooLow(options: AngularPeerFloorsTooLowOptions): Promise<readonly string[]> {
  const semver = await loadSemver();
  const packageDir = resolve(options.packageDir);
  const manifest = readManifest(packageDir);
  const targets = exportTargets(manifest);
  const problems: string[] = [];

  const scan = readDeclarations(semver, packageDir, entryFiles(packageDir, targets));

  for (const [file, count] of scan.unreadable) {
    problems.push(
      `${file} has ${String(count)} partial declaration${count === 1 ? '' : 's'} whose minVersion could not be ` +
        `read, so the Angular ${count === 1 ? 'it needs' : 'they need'} was not compared and may be newer than ` +
        'the range admits.',
    );
  }

  if (targets.length === 0) {
    problems.push(
      'the manifest declares no `exports`, so there is no JavaScript to read partial declarations from — ' +
        'this check follows `exports` and nothing else.',
    );
  } else if (scan.files === 0) {
    problems.push(
      `\`exports\` reaches no JavaScript file that exists under ${options.packageDir}, so nothing was read — ` +
        'point `packageDir` at the built package.',
    );
  } else if (scan.declarations.length === 0 && scan.unreadable.size === 0) {
    problems.push(
      `none of the ${String(scan.files)} JavaScript file${scan.files === 1 ? '' : 's'} \`exports\` reaches ` +
        'contains a partial declaration (`ɵɵngDeclare*`), so there is no minVersion to hold the ' +
        '@angular/core range to — a full-compilation build, a package with no Angular code, ' +
        'or declaration names a bundler escaped.',
    );
  }

  let highest: Declaration | undefined;
  for (const declaration of scan.declarations) {
    if (highest === undefined || semver.compare(declaration.needs, highest.needs) > 0) highest = declaration;
  }

  const range = dependencyRecord(manifest.peerDependencies)['@angular/core'];
  if (range === undefined) {
    problems.push(
      'the manifest declares no @angular/core peer dependency, so nothing holds a consumer to an Angular ' +
        'that can link its declarations.',
    );
    return problems;
  }
  if (semver.validRange(range) === null) {
    problems.push(`the @angular/core peer range "${range}" is not a semver range, so its floor cannot be read.`);
    return problems;
  }
  const lowest = semver.minVersion(range);
  if (lowest === null) {
    problems.push(`the @angular/core peer range "${range}" admits no version at all.`);
    return problems;
  }
  if (highest === undefined) return problems;

  const floor = `${String(lowest.major)}.${String(lowest.minor)}.${String(lowest.patch)}`;
  if (semver.lt(floor, highest.needs)) {
    const above = scan.declarations.filter(declaration => semver.lt(floor, declaration.needs)).length;
    problems.push(
      `@angular/core is a peer at "${range}", which admits ${lowest.version}, and ${String(above)} partial ` +
        `declaration${above === 1 ? ' needs' : 's need'} newer — the highest, ${highest.name} in ${highest.file}, ` +
        `has minVersion ${highest.minVersion} (published with Angular ${highest.version}), which the linker ` +
        `of any Angular below ${highest.needs} refuses, so the floor has to be at least ${highest.needs}.`,
    );
  }
  return problems;
}

/** One `ɵɵngDeclare*` call, read. */
interface Declaration {
  /** The file it is in, relative to the package, with forward slashes. */
  readonly file: string;
  /** The declaration function, `ɵɵngDeclareComponent` and so on. */
  readonly name: string;
  /** `minVersion` as written. */
  readonly minVersion: string;
  /** `version` as written: the Angular that compiled it. */
  readonly version: string;
  /** `minVersion` with its prerelease stripped, which is what the linker compares. */
  readonly needs: string;
}

interface Scan {
  /** How many JavaScript files were read, chunks included. */
  readonly files: number;
  readonly declarations: readonly Declaration[];
  /** File to the number of declarations in it that could not be read. */
  readonly unreadable: ReadonlyMap<string, number>;
}

const JAVASCRIPT = new Set(['.js', '.mjs', '.cjs']);

/**
 * A call to any declaration function. Every name the linker handles starts
 * with this, so a name a later Angular adds is found without the check having
 * to learn it — and a new name arrives with a new `minVersion`, which makes it
 * precisely the declaration that matters most.
 */
const DECLARATION = /ɵɵngDeclare(\w+)\s*\(/g;

/**
 * The two keys the compiler writes first in every declaration, in this order,
 * as string literals. Sticky, so it reads only from where the call opened: a
 * search that ran ahead would borrow the keys of the next declaration in the
 * file, and the one it skipped is exactly the declaration this check has to
 * report as unread.
 */
const FIRST_TWO_KEYS = /\s*\{\s*minVersion\s*:\s*(["'])([^"'\r\n]*)\1\s*,\s*version\s*:\s*(["'])([^"'\r\n]*)\3/y;

/**
 * A relative specifier in a static or dynamic import, a re-export, a bare
 * side-effect import or a `require`. Text, so one inside a string literal
 * matches too; that costs a read of a file in the same package and nothing
 * else, which is cheaper than missing a chunk.
 */
const RELATIVE_SPECIFIER = /\b(?:from|import|require)\s*\(?\s*(["'])(\.\.?\/[^"'\r\n]+)\1/g;

/** The JavaScript files `exports` points at, wildcards expanded. */
function entryFiles(packageDir: string, targets: ReturnType<typeof exportTargets>): string[] {
  const files: string[] = [];
  for (const { subpath, target } of targets) {
    // A target not starting with "./" is refused by Node outright, so no
    // consumer loads it; `unresolvedExports` reports it.
    if (target === null || !target.startsWith('./')) continue;
    if (target.includes('*')) {
      if (subpath.includes('*')) files.push(...wildcardMatches(packageDir, target).filter(isJavaScript));
      continue;
    }
    const file = join(packageDir, target.slice(2));
    if (isJavaScript(file) && isFile(file)) files.push(file);
  }
  return files;
}

function readDeclarations(semver: SemverApi, packageDir: string, entries: readonly string[]): Scan {
  const queue = [...new Set(entries)];
  const seen = new Set(queue);
  const declarations: Declaration[] = [];
  const unreadable = new Map<string, number>();

  for (let index = 0; index < queue.length; index += 1) {
    const path = queue[index] as string;
    const text = readFileSync(path, 'utf8');
    const file = relative(packageDir, path).split(sep).join(posix.sep);

    for (const call of text.matchAll(DECLARATION)) {
      FIRST_TWO_KEYS.lastIndex = call.index + call[0].length;
      const keys = FIRST_TWO_KEYS.exec(text);
      const minVersion = keys?.[2];
      const version = keys?.[4];
      const needs = minVersion === undefined ? null : stripped(semver, minVersion);
      // `version` is captured for the finding and never parsed: the linker only
      // prints it, so a declaration whose `version` is not a version still links
      // or refuses on its `minVersion` alone, and reporting it would name the
      // wrong key.
      if (minVersion === undefined || version === undefined || needs === null) {
        unreadable.set(file, (unreadable.get(file) ?? 0) + 1);
        continue;
      }
      declarations.push({ file, name: `ɵɵngDeclare${call[1] as string}`, minVersion, version, needs });
    }

    for (const match of text.matchAll(RELATIVE_SPECIFIER)) {
      const next = resolveRelative(packageDir, path, match[2] as string);
      if (next !== null && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  return { files: queue.length, declarations, unreadable };
}

/**
 * `14.1.0-next.2` to `14.1.0`, the way the linker's `getRange` does it before
 * every comparison. `null` for a string that is not a version at all, where the
 * linker's own `new SemVer()` would throw.
 */
function stripped(semver: SemverApi, version: string): string | null {
  const parsed = semver.parse(version);
  return parsed === null ? null : `${String(parsed.major)}.${String(parsed.minor)}.${String(parsed.patch)}`;
}

/**
 * The file a relative specifier loads, inside the package, or `null`.
 *
 * The extension and `index` fallbacks are for `require` and for older builds
 * that emitted extensionless specifiers; an ESM bundle names the file exactly
 * and resolves on the first candidate.
 */
function resolveRelative(packageDir: string, from: string, specifier: string): string | null {
  const base = resolve(dirname(from), specifier);
  const inside = relative(packageDir, base);
  if (inside === '..' || inside.startsWith(`..${sep}`) || isAbsolute(inside)) return null;
  const candidates = [
    base,
    ...[...JAVASCRIPT].map(extension => `${base}${extension}`),
    ...[...JAVASCRIPT].map(extension => join(base, `index${extension}`)),
  ];
  return candidates.find(candidate => isJavaScript(candidate) && isFile(candidate)) ?? null;
}

/**
 * Every file a single-`*` target expands to. Node's rule is that `*` stands
 * for any substring, slashes included, so the walk starts at the deepest
 * directory the prefix fixes and matches on the path relative to the package.
 * `node_modules` is not walked: a target like `./*` would otherwise read every
 * dependency of a package checked from its repository root.
 */
function wildcardMatches(packageDir: string, target: string): string[] {
  const pattern = target.slice(2);
  const star = pattern.indexOf('*');
  const prefix = pattern.slice(0, star);
  const suffix = pattern.slice(star + 1);
  const matches: string[] = [];

  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full);
        continue;
      }
      const path = relative(packageDir, full).split(sep).join(posix.sep);
      if (path.length >= prefix.length + suffix.length && path.startsWith(prefix) && path.endsWith(suffix)) {
        matches.push(full);
      }
    }
  };
  walk(join(packageDir, prefix.slice(0, prefix.lastIndexOf('/') + 1)));
  return matches.sort();
}

function isJavaScript(path: string): boolean {
  return JAVASCRIPT.has(extname(path));
}

function isFile(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isFile() === true;
}

interface SemverVersion {
  readonly version: string;
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

/** The part of `semver` this file uses. */
interface SemverApi {
  parse(version: string): SemverVersion | null;
  validRange(range: string): string | null;
  minVersion(range: string): SemverVersion | null;
  compare(left: string, right: string): number;
  lt(left: string, right: string): boolean;
}

async function loadSemver(): Promise<SemverApi> {
  try {
    const loaded = (await import('semver')) as { default?: unknown };
    // CommonJS, so it arrives under `default` from ESM and as the namespace
    // itself through a CJS-interop build, the same as `typescript` does.
    return (loaded.default ?? loaded) as SemverApi;
  } catch {
    throw new Error(
      'ngtrue: `angularPeerFloorsTooLow` needs the `semver` package, which is an optional peer ' +
        'dependency and is not installed here. The lowest version a range admits is range arithmetic, ' +
        'and it uses the same library npm resolves the range with rather than an approximation of it.',
    );
  }
}
