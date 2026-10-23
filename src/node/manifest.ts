import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, posix, sep } from 'node:path';

/**
 * The parts of a `package.json` the checks in this entry point read.
 *
 * Deliberately loose. A manifest is other people's data and the checks here are
 * run against packages ngtrue has never seen, so nothing is asserted about a
 * field's shape until the check that needs it looks at it — a type assertion
 * that turned out to be wrong would surface as a crash inside a test rather
 * than as the finding the test was written to get.
 */
export interface Manifest {
  readonly name?: unknown;
  readonly version?: unknown;
  readonly type?: unknown;
  readonly exports?: unknown;
  readonly dependencies?: unknown;
  readonly peerDependencies?: unknown;
  readonly peerDependenciesMeta?: unknown;
  readonly schematics?: unknown;
  readonly 'ng-update'?: unknown;
}

/** An `exports` target, after conditions and fallback arrays are resolved away. */
export interface ExportTarget {
  /** The subpath as it is written in `exports` — `"."`, `"./testing"`, `"./i18n/*"`. */
  readonly subpath: string;
  /** The chain of conditions that leads here, outermost first. Empty for a bare string target. */
  readonly conditions: readonly string[];
  /** The target as written, relative to the package root. `null` means "blocked". */
  readonly target: string | null;
}

export function readManifest(packageDir: string): Manifest {
  const path = join(packageDir, 'package.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`ngtrue: no package.json at ${path}.`, { cause: error });
  }
  try {
    return JSON.parse(raw) as Manifest;
  } catch (error) {
    throw new Error(`ngtrue: ${path} is not valid JSON — ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

/**
 * Flatten `exports` into one entry per reachable target.
 *
 * Handles the three shapes Node allows and that a real manifest mixes freely: a
 * bare string, a conditions object, and a fallback array. Sugar — `"exports":
 * "./index.js"` or a conditions object with no subpaths at all — is normalised
 * to the `"."` subpath, so a caller never has to ask which spelling was used.
 */
export function exportTargets(manifest: Manifest): readonly ExportTarget[] {
  const exports = manifest.exports;
  if (exports === undefined || exports === null) return [];

  const found: ExportTarget[] = [];

  const walk = (subpath: string, node: unknown, conditions: readonly string[]): void => {
    if (node === null) {
      found.push({ subpath, conditions, target: null });
      return;
    }
    if (typeof node === 'string') {
      found.push({ subpath, conditions, target: node });
      return;
    }
    if (Array.isArray(node)) {
      // A fallback array: the first entry that resolves wins at runtime, so
      // every entry is a target this package is prepared to serve.
      for (const entry of node) walk(subpath, entry, conditions);
      return;
    }
    if (typeof node === 'object') {
      for (const [key, value] of Object.entries(node)) walk(subpath, value, [...conditions, key]);
    }
  };

  if (typeof exports === 'string' || Array.isArray(exports)) {
    walk('.', exports, []);
    return found;
  }
  if (typeof exports !== 'object') return [];

  const entries = Object.entries(exports as Record<string, unknown>);
  const hasSubpaths = entries.some(([key]) => key === '.' || key.startsWith('./'));
  if (!hasSubpaths) {
    walk('.', exports, []);
    return found;
  }
  for (const [subpath, node] of entries) walk(subpath, node, []);
  return found;
}

/**
 * The `exports` conditions a stylesheet is resolved through and TypeScript
 * never is. `sass` and `style` are what Sass's own `pkg:` importer reads;
 * `style`, `sass` and `less` are what the Angular CLI's stylesheet bundler
 * passes (`@angular/build`, `bundle-options.js`); `css`, `scss` and `stylus`
 * are how published manifests spell the same thing — angular-split ships
 * `"./theme": { "css": "./theme.css" }`.
 *
 * One set for every check here, because two checks reading the same manifest
 * must agree about which of its subpaths are stylesheets. They did not:
 * `unresolvableTypes` kept `sass` and `style` while `unexportedTypes` kept all
 * six, so on ng-zorro-antd 22.1.2 the first reported 69 `{ "less": … }`
 * wildcards as unprobed that the second passed over without a word, and on
 * angular-split 20.0.0 the first said twice that `./theme` does not resolve.
 *
 * It goes by condition and never by extension. A target outside these
 * conditions is offered to TypeScript too, whatever file it names, and what a
 * TypeScript import of it gets is a question a check may still ask.
 */
export const STYLESHEET_CONDITIONS: ReadonlySet<string> = new Set(['sass', 'style', 'less', 'css', 'scss', 'stylus']);

/** `{ "a": "^1" }` read defensively, because it is someone else's manifest. */
export function dependencyRecord(value: unknown): Readonly<Record<string, string>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [name, range] of Object.entries(value)) {
    if (typeof range === 'string') out[name] = range;
  }
  return out;
}

/**
 * The files a single-`*` target expands to, as absolute paths.
 *
 * Walks the fixed prefix directory rather than globbing, so there is no pattern
 * dialect to get wrong: Node's own rule is that `*` stands for any substring,
 * including slashes.
 */
export function filesMatching(packageDir: string, target: string): readonly string[] {
  const relative = target.slice(2);
  const star = relative.indexOf('*');
  const prefix = relative.slice(0, star);
  const suffix = relative.slice(star + 1);
  const root = join(packageDir, prefix.slice(0, prefix.lastIndexOf('/') + 1));
  if (!existsSync(root)) return [];

  const head = prefix.slice(prefix.lastIndexOf('/') + 1);
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const fromRoot = full.slice(root.length).split(sep).join(posix.sep);
      if (fromRoot.startsWith(head) && fromRoot.endsWith(suffix) && fromRoot.length >= head.length + suffix.length) {
        found.push(full);
      }
    }
  };
  walk(root);
  return found;
}
