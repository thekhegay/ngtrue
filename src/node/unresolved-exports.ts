import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, posix, resolve, sep } from 'node:path';

import { exportTargets, readManifest, type ExportTarget } from './manifest.js';

/** Options for {@link unresolvedExports}. */
/** @since 0.1.0 */
export interface UnresolvedExportsOptions {
  /**
   * The directory holding the `package.json` to check.
   *
   * Point this at the BUILT package — the directory that would be packed — and
   * not at the repository root, unless the two are the same. An `exports` map
   * describing `./dist/...` resolves against the repository fine and says
   * nothing about what npm actually shipped.
   */
  readonly packageDir: string;
}

/**
 * Every subpath in `exports` that does not resolve to a file on disk, as one
 * sentence each. An empty array is a pass.
 *
 * ```ts
 * it('ships every file it advertises', () => {
 *   expect(unresolvedExports({ packageDir: 'dist' })).toEqual([]);
 * });
 * ```
 *
 * Node reads `exports` as the package's whole public surface: a subpath that is
 * not listed cannot be imported at all, and one that IS listed and points at
 * nothing fails at the consumer's import with `ERR_MODULE_NOT_FOUND`. Nothing
 * in a normal build catches the second case — the manifest is data, the build
 * writes files, and no step compares them — so it surfaces after publishing,
 * in someone else's install.
 *
 * Every condition is followed, not just the one this process would pick. A
 * `require` branch left pointing at a file a later build stopped emitting is
 * invisible to a test suite that only ever imports, and to every developer on
 * the team who only ever imports.
 *
 * A subpath containing `*` is checked by expansion: the pattern must match at
 * least one real file. That is weaker than the literal case on purpose — a
 * pattern stands for an open set, and the only thing that can be said about it
 * from the filesystem is whether the set is empty. An empty one is a dead
 * subpath and is reported; a pattern that matches a hundred files and misses
 * the one a consumer wants cannot be seen from here.
 *
 * What it does not check: that a resolved file is loadable. A `.js` that
 * imports a missing sibling resolves perfectly and still throws on import.
 * Resolution is a question about the manifest, and that is a question about the
 * build.
 *
 * @since 0.1.0
 */
export function unresolvedExports(options: UnresolvedExportsOptions): readonly string[] {
  const packageDir = resolve(options.packageDir);
  const manifest = readManifest(packageDir);
  const targets = exportTargets(manifest);

  if (targets.length === 0) {
    return [
      'the manifest declares no `exports`, so Node falls back to `main` and every file in ' +
        'the package is importable by its path — including ones that were never meant to be ' +
        'public. If that is deliberate, do not run this check; if it is not, add an `exports` map.',
    ];
  }

  const problems: string[] = [];
  for (const target of targets) {
    if (target.target === null) continue; // `null` blocks a subpath on purpose.

    if (!target.target.startsWith('./')) {
      problems.push(`${where(target)} is \`${target.target}\`, which Node rejects: a target must start with "./".`);
      continue;
    }

    const stars = (target.target.match(/\*/g) ?? []).length;
    if (stars > 0) {
      if (!target.subpath.includes('*')) {
        problems.push(
          `${where(target)} contains "*" but the subpath "${target.subpath}" does not, so it can never expand.`,
        );
        continue;
      }
      if (stars > 1) {
        problems.push(`${where(target)} contains ${String(stars)} "*"; Node expands only the first.`);
        continue;
      }
      if (matchCount(packageDir, target.target) === 0) {
        problems.push(`${where(target)} matches no file under ${options.packageDir}.`);
      }
      continue;
    }

    const file = join(packageDir, target.target.slice(2));
    if (!existsSync(file)) {
      problems.push(`${where(target)} points at ${target.target}, which does not exist.`);
    } else if (statSync(file).isDirectory()) {
      problems.push(`${where(target)} points at ${target.target}, which is a directory — Node will not resolve it.`);
    }
  }
  return problems;
}

function where(target: ExportTarget): string {
  const conditions =
    target.conditions.length === 0 ? '' : ` (condition ${target.conditions.map(c => `"${c}"`).join(' → ')})`;
  return `exports["${target.subpath}"]${conditions}`;
}

/**
 * How many files a single-`*` target expands to.
 *
 * Walks the fixed prefix directory rather than globbing, so there is no pattern
 * dialect to get wrong: Node's own rule is that `*` stands for any substring,
 * including slashes.
 */
function matchCount(packageDir: string, target: string): number {
  const relative = target.slice(2);
  const star = relative.indexOf('*');
  const prefix = relative.slice(0, star);
  const suffix = relative.slice(star + 1);
  const root = join(packageDir, prefix.slice(0, prefix.lastIndexOf('/') + 1));
  if (!existsSync(root)) return 0;

  const head = prefix.slice(prefix.lastIndexOf('/') + 1);
  let count = 0;
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const fromRoot = full.slice(root.length).split(sep).join(posix.sep);
      if (fromRoot.startsWith(head) && fromRoot.endsWith(suffix) && fromRoot.length >= head.length + suffix.length) {
        count += 1;
      }
    }
  };
  walk(root);
  return count;
}
