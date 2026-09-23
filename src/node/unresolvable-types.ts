import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { exportTargets, readManifest } from './manifest.js';

/** A module-resolution mode a consumer's `tsconfig.json` can be in. */
export type ResolutionMode = 'node16' | 'bundler';

/** Options for {@link unresolvableTypes}. */
export interface UnresolvableTypesOptions {
  /** The directory holding the `package.json` to check — the BUILT package. */
  readonly packageDir: string;
  /**
   * Which modes to probe. Both by default, and both is the point: `bundler` is
   * forgiving in ways `node16` is not, so a package checked only under the mode
   * its own repository uses will still break for half its consumers.
   */
  readonly modes?: readonly ResolutionMode[];
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
 * nothing about the rest of it.
 *
 * **Only the conditions this package actually declares are probed.** An
 * ESM-only package has no `require` branch, and reporting one missing would be
 * reporting a design decision as a defect. If a package means to be dual, the
 * check that it IS dual belongs in `unresolvedExports`, where the manifest is
 * the subject.
 *
 * **`typescript` has to be installed.** It is an optional peer dependency of
 * ngtrue, and this is the only function that needs it. Any repository shipping
 * a typed package has it already; one that somehow does not gets an error
 * saying so rather than a pass.
 */
export async function unresolvableTypes(options: UnresolvableTypesOptions): Promise<readonly string[]> {
  const ts = await loadTypeScript();
  const packageDir = resolve(options.packageDir);
  const manifest = readManifest(packageDir);
  const modes = options.modes ?? (['node16', 'bundler'] as const);

  const name = manifest.name;
  if (typeof name !== 'string' || name.length === 0) {
    return [`${packageDir}/package.json has no "name", so nothing can import it by a package specifier.`];
  }

  const subpaths = [...new Set(exportTargets(manifest).map(target => target.subpath))].sort();
  const problems: string[] = [];
  const specifiers: string[] = [];

  for (const subpath of subpaths) {
    if (subpath === './package.json') continue;
    if (subpath.includes('*')) {
      problems.push(
        `exports["${subpath}"] is a wildcard and was not probed — one sample would say nothing ` +
          'about the rest of the set. Check it by hand, or list the subpaths literally.',
      );
      continue;
    }
    specifiers.push(subpath === '.' ? name : `${name}/${subpath.slice(2)}`);
  }

  if (specifiers.length === 0) return problems;

  const probe = stageProbe(name, packageDir);
  try {
    for (const mode of modes) {
      const compilerOptions = optionsFor(ts, mode);
      for (const specifier of specifiers) {
        const resolved = ts.resolveModuleName(specifier, probe.containingFile, compilerOptions, ts.sys).resolvedModule;
        if (resolved === undefined) {
          problems.push(`${specifier} does not resolve under ${mode}.`);
          continue;
        }
        if (!resolved.resolvedFileName.endsWith('.d.ts') && !resolved.resolvedFileName.endsWith('.d.mts')) {
          problems.push(
            `${specifier} resolves under ${mode} to ${resolved.resolvedFileName}, which is not a declaration file — ` +
              'a consumer importing it gets `any` and no error.',
          );
        }
      }
    }
  } finally {
    probe.dispose();
  }

  return problems;
}

interface TypeScriptApi {
  readonly sys: unknown;
  readonly ModuleKind: Record<string, number>;
  readonly ModuleResolutionKind: Record<string, number>;
  readonly ScriptTarget: Record<string, number>;
  resolveModuleName(
    name: string,
    containingFile: string,
    options: object,
    host: unknown,
  ): { resolvedModule?: { resolvedFileName: string } };
}

async function loadTypeScript(): Promise<TypeScriptApi> {
  try {
    const loaded = (await import('typescript')) as { default?: unknown };
    // TypeScript is CommonJS, so it arrives under `default` from ESM and as the
    // namespace itself from a CJS-interop build. Both spellings are live in the
    // wild depending on how the caller's runner loads it.
    return (loaded.default ?? loaded) as TypeScriptApi satisfies TypeScriptApi;
  } catch {
    throw new Error(
      'ngtrue: `unresolvableTypes` needs the `typescript` package, which is an optional peer ' +
        'dependency and is not installed here. It runs the real compiler resolver rather than ' +
        'an approximation of it, which is the whole reason to trust its answer.',
    );
  }
}

function optionsFor(ts: TypeScriptApi, mode: ResolutionMode): object {
  // `allowJs` so the resolver distinguishes "there is nothing here" from "there
  // is JavaScript here and no declarations beside it". Those are different bugs
  // with different fixes, and neither is a pass — a consumer without `allowJs`
  // gets an unresolved import from the second one, and a consumer with it gets
  // `any` and no complaint at all, which is the worse outcome of the two. A
  // package that does ship declarations resolves to them either way, so turning
  // this on cannot report a correct package as broken.
  const shared = { target: ts.ScriptTarget['ES2022'], strict: true, allowJs: true };
  return mode === 'node16'
    ? { ...shared, module: ts.ModuleKind['Node16'], moduleResolution: ts.ModuleResolutionKind['Node16'] }
    : { ...shared, module: ts.ModuleKind['ESNext'], moduleResolution: ts.ModuleResolutionKind['Bundler'] };
}

/**
 * A throwaway package with the subject symlinked into its `node_modules`.
 *
 * `"type": "module"` on the probe because the probing file is ESM, which is what
 * decides between the `import` and `require` conditions under node16 — a probe
 * that left it out would silently ask the `require` question of a package that
 * only answers the `import` one.
 */
function stageProbe(name: string, packageDir: string): { containingFile: string; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'ngtrue-types-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'ngtrue-types-probe', type: 'module' }));

  const scoped = name.startsWith('@');
  const modules = join(root, 'node_modules');
  mkdirSync(scoped ? join(modules, name.split('/')[0] as string) : modules, { recursive: true });
  // `junction` is ignored everywhere but Windows, where a plain directory
  // symlink needs a privilege CI does not hand out.
  symlinkSync(packageDir, join(modules, name), 'junction');

  const containingFile = join(root, 'probe.ts');
  writeFileSync(containingFile, 'export {};\n');
  return { containingFile, dispose: () => rmSync(root, { recursive: true, force: true }) };
}
