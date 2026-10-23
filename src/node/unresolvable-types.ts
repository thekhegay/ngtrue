import { resolve } from 'node:path';

import type { CompilerOptions } from 'typescript';

import { STYLESHEET_CONDITIONS, exportTargets, readManifest } from './manifest.js';
import { loadTypeScript, stageProbe, type TypeScript } from './probe.js';

/** A module-resolution mode a consumer's `tsconfig.json` can be in. */
/** @since 0.1.0 */
export type ResolutionMode = 'node16' | 'bundler';

/**
 * Options for {@link unresolvableTypes}.
 *
 * @since 0.1.0
 */
export interface UnresolvableTypesOptions {
  /** The directory holding the `package.json` to check — the BUILT package. */
  readonly packageDir: string;
  /**
   * Which modes to probe. Both by default, and both is the point: `bundler` is
   * forgiving in ways `node16` is not, so a package checked only under the mode
   * its own repository uses will still break for half its consumers.
   */
  readonly modes?: readonly ResolutionMode[];
  /**
   * Subpaths, spelled as they are in `exports` (`"./schematics/*"`), whose
   * findings are decisions rather than defects.
   *
   * A wildcard listed here is acknowledged as unprobed: ngwr's
   * `"./i18n/*.json"` locale catalogues and `"./schematics/*"` factories are
   * not for a TypeScript import to reach, and ngwr excused the two sentences
   * about them by their opening words for want of this. A literal subpath
   * listed here is still probed under every mode, and what it reports is
   * excused — a bare string naming a `.css` file, say, which no TypeScript
   * import is meant to resolve.
   *
   * An entry that exempts nothing is reported: a subpath whose types resolve,
   * one skipped as a stylesheet, one the manifest does not have. An exemption
   * list is a claim about the package, and one that outlived the thing it
   * excused says something false the next time somebody reads it.
   */
  readonly ignore?: readonly string[];
}

/**
 * Every subpath whose TYPES do not resolve, under each mode, as one sentence
 * each. An empty array is a pass.
 *
 * ```ts
 * it('resolves its types the way a consumer will', async () => {
 *   expect(await unresolvableTypes({ packageDir: 'dist' })).toEqual([]);
 * });
 * ```
 *
 * This runs TypeScript's own resolver — the same call `tsc` and the editor
 * make — against a throwaway directory with the package symlinked into
 * `node_modules`. Nothing about the resolution is reimplemented, which matters
 * more here than anywhere else in ngtrue: the rules are intricate (condition
 * ORDER decides the answer, `types` must precede `import`, a missing `types`
 * silently falls through to the JavaScript), they differ per mode, and a
 * hand-rolled approximation of them would agree with the real thing on every
 * package that was already correct.
 *
 * Probing through a symlinked `node_modules` rather than through TypeScript's
 * self-reference support is deliberate too: a consumer resolves the package
 * from `node_modules`, and that is the layout whose answer matters.
 *
 * A subpath that resolves to JavaScript is reported as loudly as one that
 * resolves to nothing. It is the worse of the two — a consumer gets `any`, no
 * error, and the package appears to work until something that should not have
 * compiled ships.
 *
 * ## What it does not check
 *
 * **Wildcard subpaths are skipped**, and the skip is reported so it cannot pass
 * for a pass. Each one stands for an open set, and a single sample would say
 * nothing about the rest of it. One that no TypeScript import is meant to
 * reach is acknowledged in `ignore`.
 *
 * **A subpath only a stylesheet tool can reach is not probed.** When every
 * target sits under a stylesheet condition — `sass`, `style`, `less`, `css`,
 * `scss` or `stylus`, the set `unexportedTypes` leaves out as well — TypeScript
 * matches none of them, and the resolver answers "does not resolve" for a
 * subpath that was never meant for it. ngwr's
 * `"./theme": { "sass": "./theme/_index.scss", … }` family and the CDK's
 * `"./overlay-prebuilt.css": { "style": "./overlay-prebuilt.css" }` were ten of
 * the twelve lines this returned on ngwr's built package and all twelve on
 * `@angular/cdk`. With only those two conditions skipped, ng-zorro-antd 22.1.2
 * still got 69 lines, every one a wildcard only `less` and `style` reach —
 * `"./*.less": { "less": "./*.less" }` and one per component — and
 * angular-split 20.0.0 got two, both for `"./theme": { "css": "./theme.css" }`.
 * The same question reached arethetypeswrong from outside
 * (arethetypeswrong/arethetypeswrong.github.io#183, and #30 asks to ignore an
 * entry), which offers `--exclude-entrypoints` for it; here the manifest
 * already says which subpaths are stylesheets, whenever it says so with a
 * condition, and `ignore` takes the rest. A target of `null` counts as
 * unreachable for the same reason — blocking a subpath is the point of writing
 * one.
 *
 * What the skip cannot tell is intent. A subpath that is MEANT for TypeScript
 * as well — ngwr's `./theme` carries `types` and `default` beside its `sass` —
 * and loses those two conditions to a manifest generator reads exactly like a
 * stylesheet entry, so it is skipped and nothing here reports it;
 * `unresolvedExports` does not either, since the stylesheet it still names
 * exists. Whether every TypeScript entry point is still in `exports` is a
 * question about the list, and only a test that knows the list can ask it.
 *
 * The skip goes by condition and not by file extension, so a subpath with any
 * other target is probed like the rest. `{ "sass": …, "default": "./theme.js" }`
 * with no `types` is reported under both modes, because a TypeScript import
 * does land on that `.js`. A bare string pointing at a `.css` file — the shape
 * in #183 — is probed too: it offers the file to every condition, TypeScript's
 * included, and what a TypeScript import of it gets is the question this check
 * answers. A package that keeps that shape on purpose says so in `ignore`,
 * where the decision is written down rather than guessed from the extension.
 *
 * **Only the conditions this package actually declares are probed.** An
 * ESM-only package has no `require` branch, and reporting one missing would be
 * reporting a design decision as a defect. If a package means to be dual, the
 * check that it IS dual belongs in `unresolvedExports`, where the manifest is
 * the subject.
 *
 * **A probe of nothing is reported, not passed.** A package whose every subpath
 * is a wildcard, a stylesheet, `null` or `./package.json` — or that has no
 * `exports` at all — gets one sentence saying nothing was checked, rather than
 * an empty array that reads as "its types resolve". A package without `exports`
 * is not probed through `types` and `main` instead: without a map every file
 * in it is importable, so the root alone would be one sample of an open set —
 * the reason a wildcard is not probed either. Nor does `ignore` turn a run in
 * which nothing resolved into a pass: when every subpath that was probed is
 * listed there and none of them resolved, that is said too, since excusing a
 * finding is not the same as having checked something.
 *
 * **`typescript` has to be installed.** It is an optional peer dependency of
 * ngtrue, needed by this function, by `unexportedTypes` and by
 * `globalAttributeInputs`, and by nothing else. Any repository shipping a typed
 * package has it already; one that somehow does not gets an error saying so
 * rather than a pass.
 *
 * @since 0.1.0
 */
export async function unresolvableTypes(options: UnresolvableTypesOptions): Promise<readonly string[]> {
  const ts = await loadTypeScript(
    'unresolvableTypes',
    'It runs the real compiler resolver rather than an approximation of it, which is the whole reason to trust its answer.',
  );
  const packageDir = resolve(options.packageDir);
  const manifest = readManifest(packageDir);
  const modes = options.modes ?? (['node16', 'bundler'] as const);

  const name = manifest.name;
  if (typeof name !== 'string' || name.length === 0) {
    return [`${packageDir}/package.json has no "name", so nothing can import it by a package specifier.`];
  }

  const subpaths = [
    ...new Set(
      exportTargets(manifest)
        .filter(target => target.target !== null && !target.conditions.some(c => STYLESHEET_CONDITIONS.has(c)))
        .map(target => target.subpath),
    ),
  ].sort();
  const ignored = new Set(options.ignore ?? []);
  const used = new Set<string>();
  const problems: string[] = [];
  const probed: { readonly subpath: string; readonly specifier: string }[] = [];

  for (const subpath of subpaths) {
    if (subpath === './package.json') continue;
    if (subpath.includes('*')) {
      if (ignored.has(subpath)) {
        used.add(subpath);
        continue;
      }
      problems.push(
        `exports["${subpath}"] is a wildcard and was not probed — one sample would say nothing ` +
          'about the rest of the set. Check it by hand, list the subpaths literally, or acknowledge it in `ignore`.',
      );
      continue;
    }
    probed.push({ subpath, specifier: subpath === '.' ? name : `${name}/${subpath.slice(2)}` });
  }

  if (probed.length === 0) {
    // Two sentences, because "cannot be imported" would be false for both: a
    // package with no `exports` is imported through `types` and `main`, and a
    // wildcard subpath is importable and merely unprobed.
    const why =
      manifest.exports === undefined || manifest.exports === null
        ? `${name} has no \`exports\` map, and only the subpaths one declares are probed`
        : `no subpath of ${name} was probed: \`exports\` lists none that is not a wildcard, a stylesheet, ` +
          '`null` or ./package.json';
    problems.push(`${why}, so nothing was checked.`);
  } else {
    let resolvedAny = false;
    const probe = stageProbe(name, packageDir);
    try {
      for (const mode of modes) {
        const compilerOptions = optionsFor(ts, mode);
        for (const { subpath, specifier } of probed) {
          const finding = findingFor(ts, specifier, mode, probe.containingFile, compilerOptions);
          if (finding === undefined) {
            resolvedAny = true;
          } else if (ignored.has(subpath)) {
            used.add(subpath);
          } else {
            problems.push(finding);
          }
        }
      }
    } finally {
      probe.dispose();
    }

    if (!resolvedAny && probed.every(entry => ignored.has(entry.subpath))) {
      // Every line was excused, and what is left is still a run in which no
      // subpath resolved to declarations. An empty array here would say the
      // package's types resolve when none of them did.
      problems.push(
        `no subpath of ${name} resolved to declarations, and every one that was probed is listed in \`ignore\`, ` +
          'so nothing was checked.',
      );
    }
  }

  for (const entry of ignored) {
    if (used.has(entry)) continue;
    problems.push(
      `ignore lists "${entry}", which is not a subpath this check would have reported — the entry exempts nothing.`,
    );
  }

  return problems;
}

/** What a consumer importing `specifier` under `mode` would hit, or `undefined` when it reaches declarations. */
function findingFor(
  ts: TypeScript,
  specifier: string,
  mode: ResolutionMode,
  containingFile: string,
  compilerOptions: CompilerOptions,
): string | undefined {
  const resolved = ts.resolveModuleName(specifier, containingFile, compilerOptions, ts.sys).resolvedModule;
  if (resolved === undefined) return `${specifier} does not resolve under ${mode}.`;
  if (resolved.resolvedFileName.endsWith('.d.ts') || resolved.resolvedFileName.endsWith('.d.mts')) return undefined;
  return (
    `${specifier} resolves under ${mode} to ${resolved.resolvedFileName}, which is not a declaration file — ` +
    'a consumer importing it gets `any` and no error.'
  );
}

function optionsFor(ts: TypeScript, mode: ResolutionMode): CompilerOptions {
  // `allowJs` so the resolver distinguishes "there is nothing here" from "there
  // is JavaScript here and no declarations beside it". Those are different bugs
  // with different fixes, and neither is a pass — a consumer without `allowJs`
  // gets an unresolved import from the second one, and a consumer with it gets
  // `any` and no complaint at all, which is the worse outcome of the two. A
  // package that does ship declarations resolves to them either way, so turning
  // this on cannot report a correct package as broken.
  const shared = { target: ts.ScriptTarget.ES2022, strict: true, allowJs: true };
  return mode === 'node16'
    ? { ...shared, module: ts.ModuleKind.Node16, moduleResolution: ts.ModuleResolutionKind.Node16 }
    : { ...shared, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler };
}
