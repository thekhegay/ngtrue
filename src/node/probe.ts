import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type * as TS from 'typescript';

/**
 * The TypeScript namespace, as loaded at run time.
 *
 * A type-only import, so it is erased from the emitted JavaScript and nothing
 * here loads `typescript` until a check asks for it. That is the whole point of
 * it being an OPTIONAL peer: `unresolvedExports`, `peerDependencyMismatches`,
 * `unloadableSchematics` and `angularPeerFloorsTooLow` never touch it, and a
 * repository that only runs those must not need it installed.
 */
export type TypeScript = typeof TS;

/**
 * Load `typescript` lazily, or say plainly that it is missing.
 *
 * `caller` names the check in the error, because the person reading it called
 * that check and not this helper.
 */
export async function loadTypeScript(caller: string, why: string): Promise<TypeScript> {
  try {
    const loaded = (await import('typescript')) as { default?: unknown };
    // TypeScript is CommonJS, so it arrives under `default` from ESM and as the
    // namespace itself from a CJS-interop build. Both spellings are live in the
    // wild depending on how the caller's runner loads it.
    return (loaded.default ?? loaded) as TypeScript;
  } catch {
    throw new Error(
      `ngtrue: \`${caller}\` needs the \`typescript\` package, which is an optional peer ` +
        `dependency and is not installed here. ${why}`,
    );
  }
}

/**
 * A throwaway package with the subject symlinked into its `node_modules`.
 *
 * `"type": "module"` on the probe because the probing file is ESM, which is what
 * decides between the `import` and `require` conditions under node16 — a probe
 * that left it out would silently ask the `require` question of a package that
 * only answers the `import` one.
 *
 * `source` is what the probing file holds. A resolver call needs only a file to
 * resolve FROM; a check that builds a whole program writes its imports here, so
 * the program reaches the package by exactly the path a consumer's would.
 */
export function stageProbe(
  name: string,
  packageDir: string,
  source = 'export {};\n',
): { containingFile: string; dispose: () => void } {
  const root = mkdtempSync(join(tmpdir(), 'ngtrue-types-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'ngtrue-types-probe', type: 'module' }));

  const scoped = name.startsWith('@');
  const modules = join(root, 'node_modules');
  mkdirSync(scoped ? join(modules, name.split('/')[0] as string) : modules, { recursive: true });
  // `junction` is ignored everywhere but Windows, where a plain directory
  // symlink needs a privilege CI does not hand out.
  symlinkSync(packageDir, join(modules, name), 'junction');

  const containingFile = join(root, 'probe.ts');
  writeFileSync(containingFile, source);
  return { containingFile, dispose: () => rmSync(root, { recursive: true, force: true }) };
}
