import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FIXTURES } from './fixtures/paths.js';
import { unloadableSchematics } from './unloadable-schematics.js';

/** What Node says when it evaluates CommonJS as ESM, on every Node the CLI supports. */
const ESM_SCOPE = 'exports is not defined in ES module scope';

/** The packed file list of the schematics fixtures, minus the nested manifest. */
const WITHOUT_NESTED_MANIFEST = [
  'package.json',
  'index.js',
  'schematics/collection.json',
  'schematics/ng-add/index.js',
  'schematics/ng-add/schema.json',
  'schematics/migrations.json',
  'schematics/migrations/v2/index.js',
];

function probesLeft(): string[] {
  const modules = join(process.cwd(), 'node_modules');
  return existsSync(modules) ? readdirSync(modules).filter(entry => entry.startsWith('.ngtrue-schematics-')) : [];
}

// Every call that is not handed `files` spawns `npm pack --dry-run`, which is
// most of a second on a quiet machine and more on a busy runner.
describe('unloadableSchematics', { timeout: 30_000 }, () => {
  it('loads every schematic and migration of a sound package', async () => {
    // Its ng-add factory requires `@angular-devkit/schematics`, so this also
    // proves the probe sits where the packages the CLI supplies resolve — a
    // probe in the system temp directory fails this with `Cannot find module`.
    expect(await unloadableSchematics({ packageDir: FIXTURES.schematicsSound })).toEqual([]);
  });

  describe('on CommonJS schematics under a "type": "module" manifest', () => {
    it('reports every schematic and migration when the nested manifest was never written', async () => {
      const problems = await unloadableSchematics({ packageDir: FIXTURES.schematicsEsmScope });

      expect(problems).toHaveLength(2);
      expect(problems[0]).toMatch(/^@fixture\/schematics-esm-scope:ng-add \(schematics\) does not load — /);
      expect(problems[1]).toMatch(/^@fixture\/schematics-esm-scope:migration-v2 \(ng-update\) does not load — /);
      expect(problems.every(problem => problem.includes(ESM_SCOPE))).toBe(true);
    });

    it('reports the same when the nested manifest is on disk and the tarball leaves it out', async () => {
      // ng-packagr#3343: the generated `.npmignore` said `**/package.json`. The
      // file is right there, which is why a check reading the directory passes.
      expect(existsSync(join(FIXTURES.schematicsIgnored, 'schematics/package.json'))).toBe(true);

      const problems = await unloadableSchematics({ packageDir: FIXTURES.schematicsIgnored });

      expect(problems).toHaveLength(2);
      expect(problems[0]).toMatch(/^@fixture\/schematics-ignored:ng-add \(schematics\) does not load — /);
      expect(problems[1]).toMatch(/^@fixture\/schematics-ignored:migration-v2 \(ng-update\) does not load — /);
      expect(problems.every(problem => problem.includes(ESM_SCOPE))).toBe(true);
    });

    it('judges the files it is given, in both directions', async () => {
      const restored = await unloadableSchematics({
        packageDir: FIXTURES.schematicsIgnored,
        files: [...WITHOUT_NESTED_MANIFEST, 'schematics/package.json'],
      });
      const dropped = await unloadableSchematics({
        packageDir: FIXTURES.schematicsSound,
        files: WITHOUT_NESTED_MANIFEST,
      });

      expect(restored).toEqual([]);
      expect(dropped).toHaveLength(2);
      expect(dropped.every(problem => problem.includes(ESM_SCOPE))).toBe(true);
    });
  });

  describe('on a factory named by package rather than by relative path', () => {
    const SELF_REFERENCE_WITHOUT_NESTED_MANIFEST = [
      'package.json',
      'schematics/collection.json',
      'schematics/ng-add/index.js',
    ];

    it('loads it from the packed copy, where a consumer would find it', async () => {
      // The devkit alone resolves the reference from its own install, which
      // the staged copy is not under: it reads `Cannot find module` here for
      // a package that loads in every consumer's workspace.
      expect(await unloadableSchematics({ packageDir: FIXTURES.schematicsSelfReference })).toEqual([]);
    });

    it('judges the packed copy even where the repository links the package into its own node_modules', async () => {
      // The npm, pnpm and yarn workspace shape. Resolved from the devkit's
      // install, the reference lands in the LINKED directory, where the nested
      // manifest the file list leaves out is still on disk, and the broken
      // package passes.
      const scope = join(process.cwd(), 'node_modules', '@fixture');
      const link = join(scope, 'schematics-self-reference');
      const createdScope = !existsSync(scope);
      mkdirSync(scope, { recursive: true });
      symlinkSync(FIXTURES.schematicsSelfReference, link, 'junction');
      try {
        // What makes the link dangerous: the manifest is right there behind it.
        expect(existsSync(join(link, 'schematics/package.json'))).toBe(true);

        const problems = await unloadableSchematics({
          packageDir: FIXTURES.schematicsSelfReference,
          files: SELF_REFERENCE_WITHOUT_NESTED_MANIFEST,
        });

        expect(problems).toHaveLength(1);
        expect(problems[0]).toMatch(/^@fixture\/schematics-self-reference:ng-add \(schematics\) does not load — /);
        expect(problems[0]).toContain(ESM_SCOPE);
      } finally {
        rmSync(link);
        if (createdScope) rmdirSync(scope);
      }
    });
  });

  it('stages the package npm packs, not the workspaces of a root it is pointed at', async () => {
    // With `workspaces=true` in an `.npmrc`, a plain `npm pack` in a workspace
    // root packs the members and not the root. Staging the first member's list
    // under the root's manifest leaves the collection behind, and the check
    // reports a fault the root does not have.
    const before = process.env['npm_config_workspaces'];
    process.env['npm_config_workspaces'] = 'true';
    try {
      // The hazard first, so this cannot pass on an npm that stopped reading
      // the setting: asked plainly, npm packs the member.
      const plain = JSON.parse(
        execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
          cwd: FIXTURES.schematicsWorkspaceRoot,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: process.platform === 'win32',
        }),
      ) as readonly { readonly name: string }[];
      expect(plain.map(pack => pack.name)).toEqual(['@fixture/schematics-workspace-member']);

      expect(await unloadableSchematics({ packageDir: FIXTURES.schematicsWorkspaceRoot })).toEqual([]);
    } finally {
      if (before === undefined) delete process.env['npm_config_workspaces'];
      else process.env['npm_config_workspaces'] = before;
    }
  });

  describe('on a package with one fault per schematic', () => {
    it('names each fault against its own entry', async () => {
      const problems = await unloadableSchematics({ packageDir: FIXTURES.schematicsFaults });

      expect(problems).toEqual([
        '@fixture/schematics-faults:not-a-function (schematics) loads, but its factory "./factories#notAFunction" ' +
          'is an object, not a function — the devkit accepts it and the CLI fails when it runs it.',
        '@fixture/schematics-faults:missing-export (schematics) does not load — ' +
          'Schematic "missing-export" cannot resolve the factory.',
        '@fixture/schematics-faults:missing-schema (schematics) does not load — ' +
          'Path "node_modules/@fixture/schematics-faults/schemas/never-copied.json" does not exist.',
        '@fixture/schematics-faults:missing-module (schematics) does not load — ' +
          "Cannot find module 'node_modules/@fixture/schematics-faults/not-emitted'",
        '"ng-update".migrations points at ./migrations.json, which is not among the packed files — ' +
          'the CLI stops with "Migrations for package were not found."',
      ]);
    });

    it('says nothing about the entry that loads, so a finding is about one schematic and not the collection', async () => {
      const problems = await unloadableSchematics({ packageDir: FIXTURES.schematicsFaults });

      expect(problems.some(problem => problem.includes(':fine '))).toBe(false);
    });

    it('writes paths as a consumer would find them, not as the probe they were measured in', async () => {
      const problems = await unloadableSchematics({ packageDir: FIXTURES.schematicsFaults });

      expect(problems.some(problem => problem.includes('node_modules/@fixture/schematics-faults/'))).toBe(true);
      expect(problems.some(problem => problem.includes('.ngtrue-schematics-'))).toBe(false);
    });
  });

  it('reports a "schematics" field the devkit refuses, and a migrations path outside the package', async () => {
    expect(await unloadableSchematics({ packageDir: FIXTURES.schematicsRefused })).toEqual([
      'the "schematics" collection does not load — ' +
        'Package "@fixture/schematics-refused" was found but does not support schematics.',
      '"ng-update".migrations is ../shared/migrations.json, outside the package — ' +
        'the CLI stops with "Paths outside the package root are not permitted."',
    ]);
  });

  it('reports an empty collection rather than passing it, and an absolute migrations path', async () => {
    expect(await unloadableSchematics({ packageDir: FIXTURES.schematicsEmpty })).toEqual([
      'the "schematics" collection at node_modules/@fixture/schematics-empty/collection.json lists no ' +
        'schematics, so nothing was checked.',
      '"ng-update".migrations is the absolute path /schematics/migrations.json — ' +
        'the CLI stops with "Absolute paths are not permitted."',
    ]);
  });

  it('reports an encapsulated collection as unchecked rather than loading it with the wrong loader', async () => {
    // Its factory is CommonJS under a module manifest and has no nested
    // manifest: `require()` would throw, and the CLI's wrapper loads it. Either
    // verdict from this check would be about a loader the CLI does not use.
    expect(await unloadableSchematics({ packageDir: FIXTURES.schematicsEncapsulated })).toEqual([
      'the "schematics" collection sets "encapsulation": true, so the CLI loads it through its own wrapper ' +
        'rather than require(), and it was not checked — a plain require() would answer for a loader the CLI does not use.',
      '"ng-update".migrations is an array, not a string — ' +
        'the CLI stops with "Package contains a malformed migrations field."',
    ]);
  });

  it('answers about the manifest when it declares nothing to load', async () => {
    expect(await unloadableSchematics({ packageDir: FIXTURES.noExports })).toEqual([
      'the manifest declares neither "schematics" nor "ng-update".migrations, so `ng add`, `ng generate` ' +
        'and `ng update` have nothing to load and nothing was checked.',
    ]);
  });

  it('answers about the manifest when there is no name to resolve it by', async () => {
    const problems = await unloadableSchematics({ packageDir: FIXTURES.nameless });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('no "name"');
  });

  it('answers about the manifest when its name is not one a package can be installed as', async () => {
    // Before anything is staged: the name becomes a path under the probe, and
    // this one would put the files two directories above it.
    const problems = await unloadableSchematics({ packageDir: FIXTURES.schematicsBadName });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('names itself "../../outside", which no package can be installed as');
    expect(existsSync(join(process.cwd(), 'node_modules', 'outside'))).toBe(false);
  });

  describe('a `files` list', () => {
    it('is refused without package.json, which every packer ships', async () => {
      await expect(
        unloadableSchematics({ packageDir: FIXTURES.schematicsSound, files: ['schematics/collection.json'] }),
      ).rejects.toThrow('the file list does not include package.json');
    });

    it('is refused when a path leaves the package', async () => {
      await expect(
        unloadableSchematics({
          packageDir: FIXTURES.schematicsSound,
          files: ['package.json', '../sound/package.json'],
        }),
      ).rejects.toThrow('"../sound/package.json" in `files` is not a path inside');
    });

    it('is refused when it names a file that is not there', async () => {
      await expect(
        unloadableSchematics({ packageDir: FIXTURES.schematicsSound, files: ['package.json', 'schematics/gone.js'] }),
      ).rejects.toThrow('"schematics/gone.js" in `files` is not a file under');
    });
  });

  it('leaves no probe behind in node_modules', async () => {
    // Findings first, so this cannot pass on a run that never staged anything.
    const problems = await unloadableSchematics({
      packageDir: FIXTURES.schematicsEsmScope,
      files: WITHOUT_NESTED_MANIFEST,
    });

    expect(problems).toHaveLength(2);
    expect(probesLeft()).toEqual([]);
  });
});
