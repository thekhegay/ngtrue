import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, rmdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, posix, relative, resolve, sep, win32 } from 'node:path';

import { readManifest } from './manifest.js';

/**
 * Options for {@link unloadableSchematics}.
 *
 * @since 0.2.0
 */
export interface UnloadableSchematicsOptions {
  /**
   * The directory holding the `package.json` to check — the BUILT package, the
   * one that would be packed.
   */
  readonly packageDir: string;
  /**
   * The files that would be packed, relative to `packageDir`. Defaults to what
   * `npm pack --dry-run` lists there.
   *
   * Pass it when npm is not the packer — a list from another tool, or one a
   * build script already holds. It must name `package.json`, because every
   * packer includes it and a list without it was not produced by one.
   */
  readonly files?: readonly string[];
}

/**
 * Every schematic and `ng update` migration a package declares that the
 * Angular CLI cannot load, as one sentence each. An empty array is a pass.
 *
 * ```ts
 * it('ships schematics the CLI can load', async () => {
 *   expect(await unloadableSchematics({ packageDir: 'dist' })).toEqual([]);
 * });
 * ```
 *
 * ## The failure it exists for
 *
 * A library whose manifest says `"type": "module"` and whose schematics are
 * compiled to CommonJS ships `ng add`, `ng generate` and `ng update` that die on
 * load with `exports is not defined in ES module scope` — Node reads every
 * `.js` under that manifest as ESM, and the CLI loads factories with
 * `require()`. A nested `schematics/package.json` saying
 * `{ "type": "commonjs" }` scopes the folder back, and the fault is that it goes
 * missing: never written, or written and then left out of the tarball, which is
 * what ng-packagr's generated `.npmignore` did with `**\/package.json`. Nothing
 * in a build notices, because nothing in a build loads a schematic, and the
 * library's own test suite runs the TypeScript sources through a runner that
 * does not care what the manifest says.
 *
 * Other people reported it eight times against seven projects in 2026 alone —
 * ng-packagr/ng-packagr#3343, ngrx/platform#5216,
 * NG-ZORRO/ng-zorro-antd#9833, vmware-clarity/ng-clarity#2417 and #2454,
 * ng-primitives/ng-primitives#890, openng-org/optimus-ui#1557 and
 * Angular-Material-Dev/mat-exp#20 — and ngwr shipped it in every release from
 * 7.0.0 to 9.1.0 before e83bcd10 wrote the nested manifest. ng-packagr#3344
 * fixed that `.npmignore`, which accounts for some of those reports and not for
 * a library that never wrote the manifest at all, as ng-primitives#890 had not.
 *
 * ## How it answers
 *
 * **With the devkit's own engine**, not an imitation of it. The files that
 * would be packed are copied into a throwaway `node_modules` and the package is
 * resolved from there by `NodeModulesEngineHost` — the class the CLI's own
 * engine host extends — through `<name>/package.json` and the `exports` map,
 * the way `ng add` resolves it. Then every collection is created and every schematic
 * in it is created, which `require()`s its factory by the devkit's
 * `path#export` rule, reads its declared schema, and follows `extends`. What
 * throws is reported with the devkit's or Node's own message, and a factory
 * that loads but is not a function is reported as well, since the devkit
 * accepts it and only the run fails.
 *
 * **The packed files, not the directory**, because the directory is not what
 * a consumer installs. A nested manifest on disk and out of the tarball is the
 * exact shape of ng-packagr#3343, and a check reading the directory passes it.
 * The list comes from `npm pack --dry-run --json --ignore-scripts` unless
 * `files` is given — without lifecycle scripts, because a check has no business
 * running a `prepack`.
 *
 * **Under the current directory**, at `node_modules/.ngtrue-schematics-*`, and
 * removed afterwards. Factories `require` what the CLI supplies —
 * `@angular-devkit/schematics`, `@schematics/angular` — and in a consumer's
 * workspace those resolve from the workspace's `node_modules`. A probe in the
 * system temp directory has no such ancestor, so every factory that imports
 * the devkit would be reported for a reason no consumer ever meets.
 *
 * `schematics` and `ng-update.migrations` are both read, and **declaring
 * neither is a finding**: the check was pointed at a package with nothing to
 * load, and an empty array would be true and would answer a question nobody
 * asked. So is a collection listing no schematics. A migrations path the CLI
 * would refuse (absolute, outside the package, not a string, not packed) is
 * reported in the CLI's own words.
 *
 * **Every entry in a collection is loaded**, not only the ones a given command
 * would run. `ng update` creates every migration in the collection before it
 * filters them by version, so one unloadable old migration fails every later
 * update — ngrx/platform#5216 died in a 15.0.0 migration during an upgrade to
 * Angular 22. A hidden or private schematic is loaded too, since
 * `ng generate` or another schematic can still reach it.
 *
 * **A factory named by package** rather than by relative path —
 * `my-lib/schematics/ng-add/index.js#default` — is resolved from the
 * collection's own directory, which is the CLI's first step too. The devkit
 * alone resolves it from its own install, which the staged copy is not under:
 * a working package would read `Cannot find module`, and in a repository that
 * links the library into its own `node_modules`, as every npm, pnpm and yarn
 * workspace does, the linked directory would be loaded instead of the tarball
 * and a dropped nested manifest would pass.
 *
 * Paths in the messages read `node_modules/<name>/…`, which is where a consumer
 * would find the same file; the probe they were measured in is gone.
 *
 * ## What it does not check
 *
 * **That a schematic works.** Loading runs each factory module's top-level code
 * and stops there: the rule the factory returns is never applied to a tree.
 * This answers the question every report above was about — the schematic never
 * started — and nothing after it.
 *
 * **The packages the CLI supplies have to be installed where it runs.** A
 * factory importing `@schematics/angular` is reported with Node's
 * `Cannot find module` when the repository running the check has none, which
 * is a fact about that repository, not the package, and the same goes for a
 * collection that `extends` one of theirs. A library that builds schematics
 * has them as dev dependencies already. The check itself needs
 * `@angular-devkit/schematics`, an optional peer of ngtrue, and throws rather
 * than passing when it is absent.
 *
 * **The answer is this Node's answer**, as the CLI's is the consumer's. A
 * true-ESM factory loads through `require()` on every Node the current CLI
 * supports and would not have on older ones.
 *
 * **A collection with `"encapsulation": true` is reported as unchecked**, not
 * passed. The CLI loads those through its own VM wrapper, which ignores the
 * manifest's `type`, so a plain `require()` would answer for a loader the CLI
 * does not use. The CLI tests the field for truthiness, so any truthy value
 * counts, not only `true`. The CLI also wraps `@angular/*`, `@schematics/*` and
 * `@nguniversal/*` by default and honours `NG_SCHEMATIC_REDIRECT`; neither is
 * modelled, the first because only Angular publishes under those scopes, the
 * second because it is the consumer's environment rather than the package's.
 *
 * **What a registry says about the package is invisible.** The CLI reads
 * `schematics` and `ng-update` from registry metadata before installing, and a
 * registry that leaves them out — angular-cli#33060, #33717 — breaks `ng add`
 * and `ng update` for a tarball this check passes.
 *
 * **Builders and migration versions are left out.** Builders load through a
 * different host with its own rules, and a version string the CLI coerces into
 * something unexpected is a separate question; neither has the provenance yet.
 *
 * It mirrors a CLI that loads with `require()`. If the CLI moves to `import()`,
 * the type-scope failure changes shape and this check has to move with it.
 *
 * @since 0.2.0
 */
export async function unloadableSchematics(options: UnloadableSchematicsOptions): Promise<readonly string[]> {
  const devkit = await loadDevkit();
  const packageDir = resolve(options.packageDir);
  const manifest = readManifest(packageDir);

  const name = manifest.name;
  if (typeof name !== 'string' || name.length === 0) {
    return [`${packageDir}/package.json has no "name", so the CLI has nothing to resolve a collection by.`];
  }
  if (!PACKAGE_NAME.test(name)) {
    return [
      `${packageDir}/package.json names itself "${name}", which no package can be installed as, so the CLI has nothing to resolve a collection by.`,
    ];
  }

  const ngUpdate = manifest['ng-update'];
  const migrations =
    ngUpdate !== null && typeof ngUpdate === 'object'
      ? (ngUpdate as { readonly migrations?: unknown }).migrations
      : undefined;

  if (manifest.schematics === undefined && migrations === undefined) {
    return [
      'the manifest declares neither "schematics" nor "ng-update".migrations, so `ng add`, `ng generate` ' +
        'and `ng update` have nothing to load and nothing was checked.',
    ];
  }

  const files = options.files === undefined ? packedFiles(packageDir, name) : checkedFiles(options.files, packageDir);
  const probe = stageProbe(name, packageDir, files);
  const problems: string[] = [];
  try {
    const engine = new devkit.SchematicEngine(probeHost(devkit, probe.root));

    if (manifest.schematics !== undefined) {
      problems.push(...loadCollection(engine, name, '"schematics"', name, 'schematics'));
    }

    if (migrations !== undefined) {
      const located = locateMigrations(migrations, probe);
      if (typeof located === 'string') problems.push(located);
      else problems.push(...loadCollection(engine, located.path, '"ng-update".migrations', name, 'ng-update'));
    }

    return problems.map(problem => problem.split(probe.modules).join('node_modules'));
  } finally {
    probe.dispose();
  }
}

/**
 * A package name as it can sit in `node_modules`: one segment, or a scope and
 * one segment, neither starting with a dot.
 *
 * Checked before anything is staged, because the name becomes a path under the
 * probe, and `../../typescript` would copy the package over the repository's
 * own install rather than into the throwaway directory that is removed
 * afterwards.
 */
const PACKAGE_NAME = /^(?:@[^/\\.][^/\\]*\/)?[^/\\.@][^/\\]*$/;

/** The slice of the devkit this check drives. Typed here so the peer stays optional. */
interface SchematicsDevkit {
  readonly SchematicEngine: new (host: unknown) => Engine;
  readonly NodeModulesEngineHost: new (paths: readonly string[]) => EngineHost;
}

/** The one method of `NodeModulesEngineHost` the probe overrides — `protected` in the devkit's own types. */
interface EngineHost {
  _resolveReferenceString(ref: string, parentPath: string, collection?: unknown): unknown;
}

interface Engine {
  createCollection(name: string): Collection;
  createSchematic(name: string, collection: Collection, allowPrivate: boolean): { readonly description: object };
}

interface Collection {
  readonly description: {
    readonly path: string;
    readonly encapsulation?: unknown;
    readonly schematics: Readonly<Record<string, { readonly factory?: unknown }>>;
  };
}

async function loadDevkit(): Promise<SchematicsDevkit> {
  let engine: { default?: unknown };
  let tools: { default?: unknown };
  try {
    engine = await import('@angular-devkit/schematics');
    // `tools` is a directory with its own `package.json`, and the devkit has no
    // `exports` map, so an ESM import has to name the file: Node's ESM resolver
    // refuses a directory where `require` would have read its `main`.
    tools = await import('@angular-devkit/schematics/tools/index.js');
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (code !== 'ERR_MODULE_NOT_FOUND' && code !== 'MODULE_NOT_FOUND') {
      throw new Error('ngtrue: `@angular-devkit/schematics` is installed and did not load.', { cause: error });
    }
    throw new Error(
      'ngtrue: `unloadableSchematics` needs the `@angular-devkit/schematics` package, which is an ' +
        'optional peer dependency and is not installed here. It loads the schematics with the ' +
        "devkit's own engine rather than an imitation of it, which is the whole reason to trust its answer.",
      { cause: error },
    );
  }
  // Both are CommonJS, so they arrive under `default` from ESM and as the
  // namespace itself from a CJS-interop build — the same split `typescript`
  // has, and for the same reason.
  const { SchematicEngine } = (engine.default ?? engine) as Pick<SchematicsDevkit, 'SchematicEngine'>;
  const { NodeModulesEngineHost } = (tools.default ?? tools) as Pick<SchematicsDevkit, 'NodeModulesEngineHost'>;
  return { SchematicEngine, NodeModulesEngineHost };
}

/**
 * The devkit's `NodeModulesEngineHost`, resolving a factory named by package
 * from the collection's directory rather than from the devkit's own install.
 *
 * The devkit resolves `my-lib/schematics/ng-add/index.js#default` with a bare
 * `require.resolve`, from wherever `@angular-devkit/schematics` is installed.
 * In a consumer's workspace that lookup passes through the `node_modules` the
 * package sits in. In the probe it does not, because the staged copy lives
 * under `node_modules/.ngtrue-schematics-*`, so the unpatched host answers
 * `Cannot find module` for a working package — and where the repository links
 * the library into its own `node_modules`, as npm, pnpm and yarn workspaces
 * do, it finds the LINKED directory, loads the files from disk rather than
 * from the tarball, and passes a package whose tarball dropped the nested
 * manifest. Both directions give the working and the broken package the same
 * answer.
 *
 * The CLI's own host (`SchematicEngineHost` in `@angular/cli`) resolves every
 * reference from the collection directory before it hands it to this same
 * method, so resolving from there is the CLI's first step rather than a new
 * rule. The result goes on as a path relative to the collection, which the
 * devkit resolves against the collection as it does any relative reference. A
 * reference that does not resolve from there throws Node's own error, as it
 * does in the CLI.
 */
function probeHost(devkit: SchematicsDevkit, root: string): unknown {
  class ProbeEngineHost extends devkit.NodeModulesEngineHost {
    override _resolveReferenceString(ref: string, parentPath: string, collection?: unknown): unknown {
      return super._resolveReferenceString(anchored(ref, parentPath), parentPath, collection);
    }
  }
  return new ProbeEngineHost([root]);
}

/** A factory reference with its path resolved from the collection directory, `#export` kept as written. */
function anchored(ref: string, parentPath: string): string {
  const hash = ref.indexOf('#');
  const path = hash === -1 ? ref : ref.slice(0, hash);
  // A relative reference is already resolved against the collection by the
  // devkit, and an absolute one names its file. Neither looks anywhere else.
  if (path.startsWith('.') || isAbsolute(path)) return ref;

  const file = createRequire(`${parentPath}/`).resolve(path, { paths: [parentPath] });
  const fromCollection = relative(parentPath, file).split(sep).join('/');
  // Across Windows drives there is no relative path, and the devkit takes an
  // absolute one as it is. Otherwise the leading dot is what makes the devkit
  // read it as relative at all: `ng-add/index.js` would be a package name.
  const spelled = isAbsolute(fromCollection)
    ? file
    : fromCollection.startsWith('.')
      ? fromCollection
      : `./${fromCollection}`;
  return hash === -1 ? spelled : `${spelled}${ref.slice(hash)}`;
}

/**
 * Create one collection and every schematic in it, as the CLI would on
 * `ng generate` or `ng update`.
 *
 * `allowPrivate`, because a private schematic is still loaded when another
 * schematic in the collection calls it, and a hidden one is still a valid
 * `ng generate` target — leaving either out would pass a factory that fails
 * the first time somebody reaches it.
 */
function loadCollection(engine: Engine, collectionName: string, field: string, name: string, tag: string): string[] {
  let collection: Collection;
  try {
    collection = engine.createCollection(collectionName);
  } catch (error) {
    return [`the ${field} collection does not load — ${messageOf(error)}`];
  }

  const { encapsulation, schematics } = collection.description;
  const entries = Object.keys(schematics);
  if (entries.length === 0) {
    return [`the ${field} collection at ${collection.description.path} lists no schematics, so nothing was checked.`];
  }
  // Truthiness, as the CLI tests it (`schematicEncapsulation ?? isFirstParty`
  // in its engine host): `"encapsulation": 1` takes the wrapper too.
  if (encapsulation) {
    return [
      `the ${field} collection sets "encapsulation": ${JSON.stringify(encapsulation)}, so the CLI loads it through its own wrapper ` +
        'rather than require(), and it was not checked — a plain require() would answer for a loader the CLI does not use.',
    ];
  }

  const problems: string[] = [];
  for (const entry of entries) {
    const label = `${name}:${entry} (${tag})`;
    let factory: unknown;
    try {
      factory = (engine.createSchematic(entry, collection, true).description as { readonly factoryFn?: unknown })
        .factoryFn;
    } catch (error) {
      problems.push(`${label} does not load — ${messageOf(error)}`);
      continue;
    }
    if (typeof factory !== 'function') {
      const ref = schematics[entry]?.factory;
      problems.push(
        `${label} loads, but its factory ${typeof ref === 'string' ? `"${ref}" ` : ''}is ${kindOf(factory)}, ` +
          'not a function — the devkit accepts it and the CLI fails when it runs it.',
      );
    }
  }
  return problems;
}

/**
 * Where `ng update` would look for the migrations collection, or the reason it
 * would refuse to.
 *
 * The order and the refusals are the CLI's (`migrateOnly` in
 * `@angular/cli`'s update command): a path inside the installed package wins,
 * anything else goes through `require.resolve` from the package, and each
 * refusal quotes the message the CLI prints, so a finding here reads like the
 * error a consumer would paste into an issue.
 */
function locateMigrations(migrations: unknown, probe: Probe): { readonly path: string } | string {
  if (typeof migrations !== 'string') {
    return `"ng-update".migrations is ${kindOf(migrations)}, not a string — the CLI stops with "Package contains a malformed migrations field."`;
  }
  if (posix.isAbsolute(migrations) || win32.isAbsolute(migrations)) {
    return `"ng-update".migrations is the absolute path ${migrations} — the CLI stops with "Absolute paths are not permitted."`;
  }
  const normalised = migrations.replace(/\\/g, '/');
  if (normalised.startsWith('../')) {
    return `"ng-update".migrations is ${migrations}, outside the package — the CLI stops with "Paths outside the package root are not permitted."`;
  }

  const local = join(probe.packageDir, normalised);
  if (existsSync(local)) return { path: local };

  try {
    return { path: createRequire(`${probe.packageDir}/`).resolve(normalised, { paths: [probe.root] }) };
  } catch (error) {
    if ((error as { code?: unknown }).code === 'MODULE_NOT_FOUND') {
      return `"ng-update".migrations points at ${migrations}, which is not among the packed files — the CLI stops with "Migrations for package were not found."`;
    }
    return `"ng-update".migrations points at ${migrations} — the CLI stops with "Unable to resolve migrations for package. [${messageOf(error)}]"`;
  }
}

/**
 * What `npm pack` would put in the tarball, read from its own dry run.
 *
 * Asking npm rather than reimplementing `files`, `.npmignore`, `.gitignore`
 * and the always-included set: those rules are exactly where the nested
 * manifest went missing, and a reimplementation would agree with npm on every
 * package that was already right.
 *
 * `--workspaces=false`, and the one pack it prints held to this package's
 * name. With `workspaces=true` in an `.npmrc`, `npm pack` in a workspace root
 * packs every member and not the root, and the first member's file list would
 * be staged under the root's manifest — a probe of files from some other
 * package, judged as this one.
 */
function packedFiles(packageDir: string, name: string): readonly string[] {
  let stdout: string;
  try {
    stdout = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts', '--workspaces=false'], {
      cwd: packageDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      // `npm` is `npm.cmd` on Windows, which Node refuses to spawn without a
      // shell. The arguments are constants, so the shell has nothing to expand.
      shell: process.platform === 'win32',
    });
  } catch (error) {
    throw new Error(
      `ngtrue: \`npm pack --dry-run\` failed in ${packageDir}, so there is no file list to stage. ` +
        'Pass `files` with the list your packer produces instead.',
      { cause: error },
    );
  }

  let packs: unknown;
  try {
    packs = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`ngtrue: \`npm pack --dry-run --json\` in ${packageDir} printed something other than JSON.`, {
      cause: error,
    });
  }
  const names = Array.isArray(packs) ? packs.map(pack => (pack as { name?: unknown }).name) : [];
  if (names.length !== 1 || names[0] !== name) {
    throw new Error(
      `ngtrue: \`npm pack --dry-run\` in ${packageDir} packed ${JSON.stringify(names)}, not "${name}" alone, ` +
        "so the file list it printed is not this package's.",
    );
  }
  const listed = ((packs as readonly unknown[])[0] as { files?: unknown }).files;
  if (!Array.isArray(listed)) {
    throw new Error(`ngtrue: \`npm pack --dry-run --json\` in ${packageDir} printed no file list.`);
  }
  return checkedFiles(
    listed.map(file => (file as { path?: unknown }).path).filter((path): path is string => typeof path === 'string'),
    packageDir,
  );
}

/**
 * A file list, held to what a packer could have produced.
 *
 * These are errors rather than findings because they describe the call, not
 * the package: a list without `package.json`, or with a path leaving the
 * package, would make every finding after it about the list.
 */
function checkedFiles(files: readonly string[], packageDir: string): readonly string[] {
  const out: string[] = [];
  for (const file of files) {
    const relative = posix.normalize(file.replace(/\\/g, '/')).replace(/^\.\//, '');
    if (isAbsolute(file) || win32.isAbsolute(file) || relative === '..' || relative.startsWith('../')) {
      throw new Error(`ngtrue: "${file}" in \`files\` is not a path inside ${packageDir}.`);
    }
    const full = join(packageDir, relative);
    if (!existsSync(full) || !statSync(full).isFile()) {
      throw new Error(`ngtrue: "${file}" in \`files\` is not a file under ${packageDir}.`);
    }
    out.push(relative);
  }
  if (!out.includes('package.json')) {
    throw new Error(
      'ngtrue: the file list does not include package.json. Every packer ships it, so a list without ' +
        'it was not produced by one, and nothing could resolve the package from it.',
    );
  }
  return out;
}

interface Probe {
  /** The directory whose `node_modules` holds the staged package. */
  readonly root: string;
  /** `root/node_modules`, rewritten to `node_modules` in every message. */
  readonly modules: string;
  /** The staged package itself. */
  readonly packageDir: string;
  readonly dispose: () => void;
}

/**
 * The packed files, copied into `node_modules/.ngtrue-schematics-*` under the
 * current directory.
 *
 * Copied rather than symlinked. Node resolves a symlinked module to its real
 * path and walks up from THERE, so every relative `require` inside a factory
 * would land in the original directory, where the file the tarball left out is
 * still sitting — and so is the nested manifest the check exists to miss.
 */
function stageProbe(name: string, packageDir: string, files: readonly string[]): Probe {
  const base = join(process.cwd(), 'node_modules');
  const createdBase = !existsSync(base);
  mkdirSync(base, { recursive: true });
  const root = mkdtempSync(join(base, '.ngtrue-schematics-'));
  const modules = join(root, 'node_modules');
  const staged = join(modules, ...name.split('/'));

  try {
    for (const file of files) {
      const target = join(staged, ...file.split('/'));
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(join(packageDir, file), target);
    }
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }

  return {
    root,
    modules,
    packageDir: staged,
    dispose: () => {
      rmSync(root, { recursive: true, force: true });
      if (!createdBase) return;
      try {
        // Only if it is still empty: something else may have written there since.
        rmdirSync(base);
      } catch {
        // Not empty, or already gone. Either way it is not ours to remove.
      }
    },
  };
}

/** A thrown value as one line: Node's multi-line messages joined, the require stack dropped. */
function messageOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const [head = raw] = raw.split(/\nRequire stack:/);
  return head
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map((line, index, lines) => (index < lines.length - 1 && !/[.!?:]$/.test(line) ? `${line}.` : line))
    .join(' ');
}

function kindOf(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (Array.isArray(value)) return 'an array';
  return typeof value === 'object' ? 'an object' : `a ${typeof value}`;
}
