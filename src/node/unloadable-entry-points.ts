import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { exportTargets, PACKAGE_NAME, readManifest, type ExportTarget } from './manifest.js';

/**
 * Options for {@link unloadableEntryPoints}.
 *
 * @since 0.3.0
 */
export interface UnloadableEntryPointsOptions {
  /**
   * The directory holding the `package.json` to check — the BUILT package, the
   * one that would be packed. Its code is imported, so a source tree has
   * nothing to run.
   */
  readonly packageDir: string;
  /**
   * Subpaths, spelled as they are in `exports` (`"."`, `"./map"`,
   * `"./locales/*"`), whose finding or "not probed" line is a decision rather
   * than a defect: an entry point that only a browser is meant to load, a
   * pattern that cannot be imported literally, a subpath whose import Node's
   * loader refuses and a bundler does not.
   *
   * An entry that excuses nothing is reported, so the list cannot outlive the
   * entry point it was written for.
   */
  readonly ignore?: readonly string[];
  /**
   * Modules to import before each entry point, after `@angular/compiler`, in
   * this order — what a consumer's test setup loads first, such as
   * `@angular/localize/init` for a library that calls `$localize` at the top
   * level of a module.
   *
   * A bare specifier is resolved from `packageDir`, as the package's own
   * imports are; a path is resolved from the current directory. One that does
   * not load is an error rather than a finding, because it is a fact about the
   * call, not the package.
   */
  readonly preload?: readonly string[];
  /**
   * How long one entry point may take to import, in milliseconds, before its
   * process is stopped and the entry point reported as not probed. Defaults to
   * 30 000.
   */
  readonly timeout?: number;
}

/**
 * Every entry point of a built package that throws while it is imported —
 * unlinked, in a fresh Node process with no DOM — as one sentence each. An
 * empty array is a pass.
 *
 * ```ts
 * it('loads every entry point unlinked and without a DOM', async () => {
 *   expect(await unloadableEntryPoints({ packageDir: 'dist' })).toEqual([]);
 * });
 * ```
 *
 * ## The question
 *
 * Can a consumer's test runner, or their server, import each entry point this
 * package ships? Or does evaluating the published JavaScript throw before the
 * first test, or the first `isPlatformBrowser`, gets to run? Two kinds of
 * failure answer no, and neither shows anywhere the author looks.
 *
 * **A class read before its declaration ran.** A library build in partial mode
 * keeps the dependencies of `ɵɵngDeclareFactory` and the predicates of its
 * queries and `hostDirectives` in static initializers, which run when the
 * class is defined. A class that names one declared further down the same
 * bundle therefore reads it in its temporal dead zone — `ReferenceError: Cannot
 * access 'FxDropdown' before initialization`. An application build never sees
 * it, because the linker rewrites those initializers into functions that run
 * later; `ngc` does not warn, and the library's own tests run its sources. What
 * does see it is a runner that loads the package unlinked, and the default
 * `ng test` is one: `@angular/build:unit-test` loads `@angular/compiler` first
 * and builds the tests with `externalPackages: true`, so Vitest's Node imports
 * the published bundle exactly as this check does. `forwardRef` does not help
 * in `hostDirectives`; declaring the class first does. Other people reported
 * it thirteen times —
 * [angular/angular-cli#34198](https://github.com/angular/angular-cli/issues/34198),
 * [MintPlayer/mintplayer-ng-bootstrap#419](https://github.com/MintPlayer/mintplayer-ng-bootstrap/issues/419),
 * [Gamekohl/frame-ui#11](https://github.com/Gamekohl/frame-ui/issues/11),
 * [Angular-Material-Dev/mat-exp#21](https://github.com/Angular-Material-Dev/mat-exp/issues/21),
 * [NG-ZORRO/ng-zorro-antd#9557](https://github.com/NG-ZORRO/ng-zorro-antd/issues/9557),
 * [angular/components#32408](https://github.com/angular/components/issues/32408),
 * [ngxpert/hot-toast#22](https://github.com/ngxpert/hot-toast/issues/22),
 * [mr-samani/ngx-input-color#8](https://github.com/mr-samani/ngx-input-color/issues/8),
 * [KroneCorylus/ngx-colors#176](https://github.com/KroneCorylus/ngx-colors/issues/176),
 * [h-k-dev/angular-email-editor#2](https://github.com/h-k-dev/angular-email-editor/issues/2),
 * [IgniteUI/igniteui-angular#15020](https://github.com/IgniteUI/igniteui-angular/issues/15020),
 * [MurhafSousli/ngx-gallery#633](https://github.com/MurhafSousli/ngx-gallery/issues/633) and
 * [graycoreio/daffodil#4593](https://github.com/graycoreio/daffodil/issues/4593),
 * the last with `forwardRef` already in place.
 *
 * **A browser global read at the top level of a module**, by the package or by
 * a dependency it imports. A server that imports the entry point — SSR,
 * prerendering, a dev server — fails with `window is not defined` before any
 * code that could have checked the platform runs, and the consumer cannot
 * catch it: [bluehalo/ngx-leaflet#369](https://github.com/bluehalo/ngx-leaflet/issues/369),
 * where leaflet reads `document` at load and `@defer` does not help, and
 * [#62](https://github.com/bluehalo/ngx-leaflet/issues/62) before it;
 * [RobinHerbots/Inputmask#2628](https://github.com/RobinHerbots/Inputmask/issues/2628),
 * [vime-js/vime#316](https://github.com/vime-js/vime/issues/316),
 * [ITS-HCD/nysds#1677](https://github.com/ITS-HCD/nysds/issues/1677),
 * [auth0/auth0-angular#432](https://github.com/auth0/auth0-angular/issues/432) and
 * [juristr/ngx-lazy-el#36](https://github.com/juristr/ngx-lazy-el/issues/36).
 * A test environment with a DOM defines `window`, so the library's tests pass.
 *
 * ## How it answers
 *
 * **Each literal subpath with a JavaScript target is imported in a fresh
 * `node` process**, a few at a time. Fresh because evaluation order is part of
 * the answer: two entry points sharing a chunk in a cycle can evaluate it in an
 * order that throws from one and not from the other, and a process that had
 * already imported the second would pass the first.
 *
 * **By the package's own name, from `packageDir`.** Node resolves a package's
 * own name through its `exports` map — the same resolution, under the same
 * `import` conditions, that a consumer's `import` goes through — so the file
 * that runs is the one a consumer gets, and its own imports resolve from where
 * it sits. The process starts with `NODE_OPTIONS` cleared, so a loader or a
 * condition the test runner was started with does not leak into the answer.
 *
 * **After `@angular/compiler`, resolved from `packageDir`, and then `preload`.**
 * Unlinked partial declarations fall back to the JIT compiler, as they do in
 * `ng test`; without it every declaration throws, and the check would report
 * every entry point for a reason no consumer meets. So it is loaded first, and
 * when it does not resolve from `packageDir` the check throws instead of
 * answering. The copy next to the package is the one its `@angular/core` would
 * meet in a consumer's install.
 *
 * ## What counts as a finding
 *
 * Anything that throws while the entry point's modules EVALUATE — its own or a
 * dependency's — with Node's message and the first frame of the stack, and a
 * second frame inside the package when the first is outside it. A read in the
 * temporal dead zone is described as the unlinked-test failure above, and a
 * global Node does not define as the server failure. A top-level `await` that
 * never settles is a finding too: Node gives up on it, and a consumer's import
 * waits forever.
 *
 * ## What is reported as not probed
 *
 * Reported, so an empty array still means everything was imported, and
 * `ignore` can acknowledge each:
 *
 * - **What Node's loader refuses before any of the code runs** — a package that
 *   does not resolve (declared or not), a file extension or a directory import
 *   Node does not accept, JSON imported without `with { type: 'json' }`, a named
 *   import a CommonJS module does not expose to Node. A bundler resolves and
 *   links by rules of its own, and a server build bundles its dependencies, so
 *   Node's refusal alone does not say a consumer's import fails.
 * - **An import that had not finished when `timeout` ran out.**
 * - **A pattern subpath**, which stands for files that cannot be imported by
 *   its literal name. List them literally, or acknowledge the pattern.
 *
 * Subpaths that are not JavaScript — stylesheets, JSON, declaration files — are
 * left out without a word. A package with no `exports`, or none with a
 * JavaScript target, is reported, and so is a run in which nothing was
 * imported, even when `ignore` acknowledged every line: acknowledging a subpath
 * excuses the line about it and does not turn "nothing was imported" into
 * "nothing was wrong".
 *
 * ## What it does not check
 *
 * **Any environment but this one**: Node without a DOM, Node's resolver and
 * conditions, the JIT compiler where an application has the linker. A pass says
 * nothing about a linked production build. It says nothing about the DOM
 * either, once rendering starts: a constructor or `ngOnInit` that reads
 * `window` on the server is past the import and out of reach here.
 *
 * **Anything after evaluation.** The process reports as soon as the import
 * settles, so a timer or a promise rejection the module leaves behind is not
 * seen.
 *
 * **Globals Node does define.** Node 21 and later define `navigator`, so reading
 * it at the top level passes here, as it does on a real server.
 *
 * **It runs code.** The top level of every entry point and of everything it
 * imports executes, as it does in `unloadableSchematics` — point it at
 * packages you would run anyway.
 *
 * @since 0.3.0
 */
export async function unloadableEntryPoints(options: UnloadableEntryPointsOptions): Promise<readonly string[]> {
  const packageDir = resolve(options.packageDir);
  const timeout = checkedTimeout(options.timeout);
  const preload = checkedPreload(options.preload);
  const manifest = readManifest(packageDir);

  const name = manifest.name;
  if (typeof name !== 'string' || name.length === 0) {
    return [`${packageDir}/package.json has no "name", so nothing can import it by a package specifier.`];
  }
  if (!PACKAGE_NAME.test(name)) {
    return [
      `${packageDir}/package.json names itself "${name}", which no package can be installed as, so nothing can import it by that name.`,
    ];
  }

  const targets = exportTargets(manifest);
  if (targets.length === 0) {
    return [
      'the manifest declares no `exports`, so there is no list of entry points to import and nothing was ' +
        'probed. Add an `exports` map, or point `packageDir` at the built package that has one.',
    ];
  }

  const subpaths = javascriptSubpaths(targets);
  if (subpaths.length === 0) {
    return ['`exports` lists no subpath with a JavaScript target, so there was nothing to import.'];
  }

  const root = realpathSync(packageDir);
  const subjects = subpaths
    .filter(subpath => !subpath.includes('*'))
    .map(subpath => ({ subpath, specifier: subpath === '.' ? name : `${name}/${subpath.slice(2)}` }));
  const probed = await probeAll(subjects, { cwd: packageDir, preload: [COMPILER, ...preload], timeout });

  const verdicts = new Map<string, Verdict>();
  for (const subpath of subpaths) {
    if (subpath.includes('*')) {
      verdicts.set(subpath, {
        kind: 'unprobed',
        text:
          `exports["${subpath}"] is a pattern and was not imported, so nothing behind it was probed. ` +
          'List its subpaths literally, or acknowledge it in `ignore`.',
      });
    }
  }
  for (const [index, result] of probed.entries()) {
    const { subpath, specifier } = subjects[index] as { subpath: string; specifier: string };
    verdicts.set(subpath, verdictOf(specifier, result, root, timeout));
  }

  const ignored = new Set(options.ignore ?? []);
  const used = new Set<string>();
  const problems: string[] = [];
  let evaluated = 0;
  for (const subpath of subpaths) {
    const verdict = verdicts.get(subpath) as Verdict;
    if (verdict.kind !== 'unprobed') evaluated++;
    if (verdict.kind === 'loaded') continue;
    if (ignored.has(subpath)) {
      used.add(subpath);
      continue;
    }
    problems.push(verdict.text);
  }

  if (evaluated === 0) {
    // Not a pass, and `ignore` cannot make it one: every line above may have
    // been acknowledged, and what is left is a run that evaluated nothing.
    problems.push(
      "no entry point was imported — each one is a pattern, was refused by Node's loader or ran out of time — " +
        'so nothing was evaluated.',
    );
  }

  for (const entry of ignored) {
    if (used.has(entry)) continue;
    problems.push(
      verdicts.get(entry)?.kind === 'loaded'
        ? `ignore lists "${entry}", and that entry point imports cleanly — the entry exempts nothing.`
        : `ignore lists "${entry}", which is not a subpath this check imports or reports — the entry exempts nothing.`,
    );
  }

  return problems;
}

/** The JIT compiler, which every unlinked partial declaration falls back to. */
const COMPILER = '@angular/compiler';

/** What one subpath came to. `loaded` and `finding` were evaluated; `unprobed` was not. */
type Verdict =
  | { readonly kind: 'loaded' }
  | { readonly kind: 'finding'; readonly text: string }
  | { readonly kind: 'unprobed'; readonly text: string };

/**
 * The subpaths with a target Node could import as code, in the order `exports`
 * lists them.
 *
 * A JavaScript extension, or none: an extensionless target, and a pattern
 * written without one, may still be code, and reporting one that is not costs
 * a line where skipping one that is costs a silent pass. Stylesheets, JSON and
 * declaration files carry an extension of their own and are left out.
 */
function javascriptSubpaths(targets: readonly ExportTarget[]): readonly string[] {
  const found = new Set<string>();
  for (const { subpath, target } of targets) {
    if (target === null) continue;
    if (/\.[cm]?js$/.test(target) || !/\.[^/]*$/.test(target)) found.add(subpath);
  }
  return [...found];
}

function checkedTimeout(timeout: number | undefined): number {
  if (timeout === undefined) return 30_000;
  if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0) {
    throw new Error(`ngtrue: \`timeout\` is ${String(timeout)}, and has to be a positive number of milliseconds.`);
  }
  return timeout;
}

/**
 * The preloads as the probe imports them: a bare specifier as it is, for Node
 * to resolve from `packageDir`, and a path as a file URL, because Node's ESM
 * loader reads `C:\…` as a URL scheme and a relative path as relative to
 * `packageDir`, where the probe runs, rather than to the caller.
 */
function checkedPreload(preload: readonly string[] | undefined): readonly string[] {
  return (preload ?? []).map(entry => {
    if (typeof entry !== 'string' || entry.length === 0) {
      throw new Error(`ngtrue: ${JSON.stringify(entry)} in \`preload\` is not a module specifier.`);
    }
    if (entry.startsWith('file:')) return entry;
    return entry.startsWith('.') || isAbsolute(entry) ? pathToFileURL(resolve(entry)).href : entry;
  });
}

/** What the probe process sends back. Phases arrive first, then at most one outcome. */
type Message =
  | { readonly phase: 'preload'; readonly specifier: string }
  | { readonly phase: 'subject' }
  | { readonly outcome: 'loaded' }
  | { readonly outcome: 'threw'; readonly error: Thrown }
  | { readonly outcome: 'preload-threw'; readonly specifier: string; readonly error: Thrown };

/** A thrown value, carried across the process boundary. `stack` is null for a value that is not an error. */
interface Thrown {
  readonly name: string | null;
  readonly message: string;
  readonly code: string | null;
  readonly stack: string | null;
}

interface Probed {
  readonly phase: 'start' | 'preload' | 'subject';
  readonly preloading: string | null;
  readonly outcome: Message | null;
  readonly code: number | null;
  readonly signal: string | null;
  readonly timedOut: boolean;
  readonly stderr: string;
}

/**
 * The script each probe process runs, as an ES module evaluated with
 * `--input-type=module`, whose URL sits in the current directory — which is
 * `packageDir`, so every bare specifier in it resolves from there, the
 * package's own name included.
 *
 * It reports over the IPC channel rather than stdout, which the code under test
 * is free to write to, and exits as soon as the import settles, because a
 * module that leaves a timer running would otherwise keep the process alive
 * until the timeout and be reported for it. Each preload is announced before
 * it is imported, so a process that dies without an outcome can still be
 * placed. `Error.stackTraceLimit` is raised so the frame inside the package
 * survives a deep throw in `@angular/core`.
 */
const PROBE = `
const { subject, preload } = JSON.parse(process.argv[1]);
Error.stackTraceLimit = 50;
const report = message => new Promise(done => process.send(message, () => done()));
const described = thrown => {
  try {
    if (thrown !== null && typeof thrown === 'object' && typeof thrown.stack === 'string') {
      return {
        name: String(thrown.name),
        message: String(thrown.message),
        code: typeof thrown.code === 'string' ? thrown.code : null,
        stack: thrown.stack,
      };
    }
    return { name: null, message: String(thrown), code: null, stack: null };
  } catch {
    return { name: null, message: typeof thrown, code: null, stack: null };
  }
};
for (const specifier of preload) {
  await report({ phase: 'preload', specifier });
  try {
    await import(specifier);
  } catch (thrown) {
    await report({ outcome: 'preload-threw', specifier, error: described(thrown) });
    process.exit(0);
  }
}
await report({ phase: 'subject' });
try {
  await import(subject);
  await report({ outcome: 'loaded' });
} catch (thrown) {
  await report({ outcome: 'threw', error: described(thrown) });
}
process.exit(0);
`;

interface ProbeSettings {
  readonly cwd: string;
  readonly preload: readonly string[];
  readonly timeout: number;
}

/**
 * Probe every subject in its own process, a few at a time, results in the
 * order given.
 *
 * Eight at most: each process loads the JIT compiler and the package, and a
 * machine reporting sixty-four cores does not have sixty-four of those worth
 * of memory to spare. A preload that fails stops the run — it fails the same
 * way in every process — and is thrown once.
 */
async function probeAll(
  subjects: readonly { readonly specifier: string }[],
  settings: ProbeSettings,
): Promise<readonly Probed[]> {
  const results: Probed[] = [];
  let next = 0;
  let failed: Probed | undefined;
  const worker = async (): Promise<void> => {
    while (failed === undefined && next < subjects.length) {
      const index = next++;
      const result = await probe((subjects[index] as { specifier: string }).specifier, settings);
      results[index] = result;
      if (result.phase !== 'subject' && failed === undefined) failed = result;
    }
  };
  const width = Math.max(1, Math.min(8, availableParallelism(), subjects.length));
  await Promise.all(Array.from({ length: width }, worker));
  if (failed !== undefined) throw preloadError(failed, settings);
  return results;
}

function probe(specifier: string, { cwd, preload, timeout }: ProbeSettings): Promise<Probed> {
  return new Promise((resolvePromise, reject) => {
    const environment = { ...process.env };
    delete environment['NODE_OPTIONS'];
    const child = spawn(
      process.execPath,
      ['--input-type=module', '-e', PROBE, JSON.stringify({ subject: specifier, preload })],
      { cwd, env: environment, stdio: ['ignore', 'ignore', 'pipe', 'ipc'], windowsHide: true },
    );

    let phase: Probed['phase'] = 'start';
    let preloading: string | null = null;
    let outcome: Message | null = null;
    let stderr = '';
    let timedOut = false;

    child.on('message', (received: unknown) => {
      const message = received as Message;
      if ('phase' in message) {
        phase = message.phase;
        preloading = message.phase === 'preload' ? message.specifier : null;
      } else {
        outcome = message;
      }
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < 16_384) stderr += chunk.toString('utf8');
    });
    const timer = setTimeout(() => {
      timedOut = true;
      // SIGKILL rather than the default SIGTERM: the code under test runs in
      // this process, and a top level that installs a SIGTERM handler, as a
      // server module's graceful shutdown does, would outlive the timeout and
      // hang the check. There is nothing in the probe to shut down cleanly.
      child.kill('SIGKILL');
    }, timeout);
    child.on('error', error => {
      clearTimeout(timer);
      reject(new Error(`ngtrue: could not start a Node process to import ${specifier}.`, { cause: error }));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ phase, preloading, outcome, code, signal, timedOut, stderr });
    });
  });
}

/** The error a failed preload is thrown as: a fact about the environment or the call, never about the package. */
function preloadError(result: Probed, { cwd, timeout }: ProbeSettings): Error {
  if (result.phase === 'start') {
    // Not even the first preload was announced: the probe script itself, or
    // Node, failed before it could say anything.
    return new Error(
      `ngtrue: a probe process in ${cwd} ended before it reported anything (${exitOf(result)})${stderrLine(result.stderr)}.`,
    );
  }
  const outcome = result.outcome;
  const specifier = outcome !== null && 'specifier' in outcome ? outcome.specifier : (result.preloading ?? COMPILER);
  const error = outcome !== null && 'error' in outcome ? outcome.error : null;

  if (specifier === COMPILER && error?.code === 'ERR_MODULE_NOT_FOUND') {
    return new Error(
      `ngtrue: \`unloadableEntryPoints\` imports \`@angular/compiler\` before every entry point, the way \`ng test\` ` +
        `does, and it does not resolve from ${cwd}. Without it every partial declaration throws, and every entry ` +
        'point would be reported for a reason no consumer meets. Install it where the package resolves its ' +
        '`@angular/core` — an Angular repository has it already.',
    );
  }
  const why =
    error !== null
      ? `threw ${headline(error)}`
      : result.timedOut
        ? `had not loaded after ${String(timeout)} ms`
        : `ended the process (${exitOf(result)}) while loading${stderrLine(result.stderr)}`;
  return new Error(`ngtrue: the preload "${specifier}", imported from ${cwd}, ${why}.`);
}

/** One subpath's result, as the sentence the caller reads. */
function verdictOf(specifier: string, result: Probed, root: string, timeout: number): Verdict {
  const outcome = result.outcome;
  if (outcome !== null && 'outcome' in outcome) {
    if (outcome.outcome === 'loaded') return { kind: 'loaded' };
    if (outcome.outcome === 'threw') return thrownVerdict(specifier, outcome.error, root);
  }
  if (result.timedOut) {
    return {
      kind: 'unprobed',
      text:
        `${specifier} was not probed: importing it had not finished after ${String(timeout)} ms, so the process ` +
        'was stopped. Raise `timeout` if the machine is busy; otherwise something at its top level keeps waiting, ' +
        "and a consumer's import waits with it.",
    };
  }
  if (result.code === 13) {
    // Node's own exit code for a top-level await left pending when the event
    // loop ran dry: nothing will ever settle it.
    return {
      kind: 'finding',
      text:
        `${specifier}: importing it never finishes — a top-level await in it, or in a module it imports, waits ` +
        "on a promise nothing settles, and Node gave up with exit code 13. A consumer's import stops at the same point.",
    };
  }
  return {
    kind: 'finding',
    text: `${specifier}: importing it ended the Node process (${exitOf(result)}) before the import settled${stderrLine(result.stderr)}.`,
  };
}

/**
 * A thrown value, judged by WHERE it was thrown rather than by what it says.
 *
 * Node resolves, loads and links a module graph before any of it evaluates, and
 * every error from those steps is raised inside `node:internal/modules/`. An
 * error whose innermost frame is there was raised by the loader — before the
 * code ran, or for an `import()` or `require()` the code made — and the rest
 * were raised by code that was running. Message text would be the weaker
 * signal: Node rewords its errors, and a named import missing from a CommonJS
 * module arrives as a plain `SyntaxError`, the same type a broken bundle
 * throws.
 */
function thrownVerdict(specifier: string, error: Thrown, root: string): Verdict {
  const frames = framesOf(error.stack);
  if (frames[0]?.startsWith('node:internal/modules/')) {
    return {
      kind: 'unprobed',
      text:
        `${specifier} was not probed: Node's loader refused it before its code could run — ${headline(error)}. ` +
        "A bundler resolves and links by rules of its own, so this alone does not say a consumer's import fails; " +
        'acknowledge it in `ignore` once you know it loads where it is used.',
    };
  }

  const files = frames.filter(frame => !frame.startsWith('node:'));
  const first = files[0];
  let where = '';
  if (first !== undefined) {
    const at = displayed(first, root);
    const dependency = dependencyOf(at);
    where = ` at ${at}`;
    if (dependency !== null) {
      where += `, inside ${dependency}, which this entry point loads`;
      const own = files.map(frame => displayed(frame, root)).find(path => dependencyOf(path) === null);
      if (own !== undefined) where += `, reached from ${own}`;
    }
  }
  const thrown = `${specifier}: evaluating it throws ${headline(error)}${where}`;

  const tdz =
    error.name === 'ReferenceError' ? /^Cannot access '(.+)' before initialization$/.exec(error.message) : null;
  if (tdz !== null) {
    return {
      kind: 'finding',
      text:
        `${thrown} — ${tdz[1] as string} is read before its declaration ran, because it is declared further down ` +
        'or in a module a cycle of imports evaluates later. A partial build reads the classes named in constructor ' +
        'parameters, queries and hostDirectives as each class is defined; an application build links those reads ' +
        'into functions that run later, and a test runner that imports the package unlinked, such as `ng test` on ' +
        'Vitest, or Jest, fails on the import.',
    };
  }

  const global = error.name === 'ReferenceError' ? /^(\S+) is not defined$/.exec(error.message) : null;
  if (global !== null) {
    return {
      kind: 'finding',
      text:
        `${thrown} — \`${global[1] as string}\` is not a global in Node, so a server importing this entry point, ` +
        'for SSR or prerendering, fails here before any isPlatformBrowser check can run; a test environment ' +
        'that defines the global, as jsdom defines window and document, does not show it.',
    };
  }

  return { kind: 'finding', text: `${thrown}, so a consumer's import fails before any of their code runs.` };
}

/**
 * The locations in a V8 stack, innermost first, minus the probe's own script
 * and the frames that have no location (`<anonymous>`, `native`).
 */
function framesOf(stack: string | null): readonly string[] {
  if (stack === null) return [];
  const frames: string[] = [];
  for (const line of stack.split('\n')) {
    const match = /^\s+at (?:async )?(?:[^(]*?\()?(.+?)(:\d+:\d+)\)?$/.exec(line);
    if (match === null) continue;
    const [, file, position] = match as unknown as [string, string, string];
    if (/\[eval\d*\]$/.test(file)) continue;
    frames.push(`${file}${position}`);
  }
  return frames;
}

/**
 * A frame's file, relative to the package when it is inside it and from the
 * last `node_modules/` when it is a dependency, which is where a consumer
 * would find the same file.
 */
function displayed(frame: string, root: string): string {
  const path = frame.startsWith('file:') ? fileFromUrl(frame) : frame;
  const inside = relative(root, path);
  const posixPath = (inside.startsWith('..') || isAbsolute(inside) ? path : inside).split(sep).join('/');
  const modules = posixPath.lastIndexOf('node_modules/');
  return modules > 0 && posixPath[modules - 1] === '/' ? posixPath.slice(modules) : posixPath;
}

/** A frame URL with its `:line:column` kept, as a path. */
function fileFromUrl(frame: string): string {
  const match = /^(.*?)((?::\d+){1,2})$/.exec(frame);
  const [url, position] = match === null ? [frame, ''] : [match[1] as string, match[2] as string];
  try {
    return `${fileURLToPath(url)}${position}`;
  } catch {
    return frame;
  }
}

/** The package a displayed path sits in, when it sits under `node_modules/`. */
function dependencyOf(path: string): string | null {
  const modules = path.lastIndexOf('node_modules/');
  if (modules === -1) return null;
  const segments = path.slice(modules + 'node_modules/'.length).split('/');
  const scoped = segments[0]?.startsWith('@') === true;
  return scoped ? `${segments[0] as string}/${segments[1] ?? ''}` : (segments[0] ?? null);
}

/** `TypeError [ERR_X]: first line of the message`, the way Node prints the head of an error. */
function headline(error: Thrown): string {
  // The first line only: Node's CommonJS interop error goes on with a code
  // sample, and the sentence this lands in is one line. Its full stop goes too,
  // because the sentence supplies its own.
  const message = (error.message.split('\n').find(line => line.trim().length > 0) ?? '').trim().replace(/\.$/, '');
  if (error.name === null) return `the value \`${message}\``;
  const label = error.code === null ? error.name : `${error.name} [${error.code}]`;
  return `\`${label}: ${message}\``;
}

function exitOf(result: Probed): string {
  return result.signal !== null ? `signal ${result.signal}` : `exit code ${String(result.code)}`;
}

/** The last line of stderr that names an error, as a clause, or nothing. */
function stderrLine(stderr: string): string {
  const lines = stderr.split('\n').map(line => line.trim());
  const line = [...lines].reverse().find(entry => /\b\w*Error\b/.test(entry)) ?? '';
  return line.length > 0 ? ` — ${line}` : '';
}
