import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import { FIXTURES } from './fixtures/paths.js';
import { unloadableEntryPoints } from './unloadable-entry-points.js';

/** The specifier each line is about: every finding and every "not probed" line opens with it. */
const subjects = (problems: readonly string[]): string[] =>
  problems.map(problem => /^(\S+?)(?::| was not probed:)/.exec(problem)?.[1] ?? problem);

/**
 * Import modules in order in ONE plain Node process started in `cwd`, the way
 * the check's probe is started, and report how it ended. The controls below
 * use it to show what the check's own answer depends on.
 */
function importInOneProcess(cwd: string, specifiers: readonly string[]): { status: number | null; stderr: string } {
  const environment = { ...process.env };
  delete environment['NODE_OPTIONS'];
  const code = specifiers.map(specifier => `await import(${JSON.stringify(specifier)});`).join('\n');
  const { status, stderr } = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    cwd,
    env: environment,
    encoding: 'utf8',
  });
  return { status, stderr };
}

/** The sentence a read in the temporal dead zone gets, after its location. */
const UNLINKED =
  'a test runner that imports the package unlinked, such as `ng test` on Vitest, or Jest, fails on the import';

/** The sentence a global Node does not define gets. */
const SERVER = 'is not a global in Node, so a server importing this entry point, for SSR or prerendering, fails here';

/** The opening of every line about something Node's loader refused. */
const REFUSED = "was not probed: Node's loader refused it before its code could run — ";

// Every call spawns a Node process per entry point, each loading the JIT
// compiler: a fraction of a second on a quiet machine, more on a busy runner.
describe('unloadableEntryPoints', { timeout: 30_000 }, () => {
  it('imports every entry point of a sound package', async () => {
    expect(await unloadableEntryPoints({ packageDir: FIXTURES.entryPointsSound })).toEqual([]);
  });

  it('loads the JIT compiler first, without which the sound package does not load at all', () => {
    // The pass above is the preload's doing and not an empty run's: the same
    // import with nothing loaded before it throws from the first partial
    // declaration it evaluates.
    const { status, stderr } = importInOneProcess(FIXTURES.entryPointsSound, ['fixture-entry-points-sound']);

    expect(status).not.toBe(0);
    expect(stderr).toMatch(/needs to be compiled using the JIT compiler, but '@angular\/compiler' is not available/);
  });

  describe('on a package that throws while it is evaluated', () => {
    let problems: readonly string[];
    beforeAll(async () => {
      problems = await unloadableEntryPoints({ packageDir: FIXTURES.entryPointsBroken });
    });
    const about = (specifier: string): string => {
      const found = problems.filter(problem => problem.startsWith(`${specifier}: `));
      expect(found, `one line about ${specifier}`).toHaveLength(1);
      return found[0] as string;
    };

    it('reports exactly the entry points that throw, and passes the rest of the package', () => {
      expect(subjects(problems)).toEqual([
        '@fixture/entry-points-broken',
        '@fixture/entry-points-broken/query',
        '@fixture/entry-points-broken/host',
        '@fixture/entry-points-broken/server',
        '@fixture/entry-points-broken/map',
        '@fixture/entry-points-broken/cycle-b',
      ]);
    });

    it('reports a class read before its declaration ran, for each way a partial build reads one', () => {
      const reads = [
        ['@fixture/entry-points-broken', 'FixtureDropdown', 'dist/index.js'],
        ['@fixture/entry-points-broken/query', 'FixtureButtonLoading', 'dist/query.js'],
        ['@fixture/entry-points-broken/host', 'FixtureRoving', 'dist/host.js'],
      ] as const;
      for (const [specifier, name, file] of reads) {
        const finding = about(specifier);

        expect(finding).toMatch(
          new RegExp(
            `^${escaped(specifier)}: evaluating it throws \`ReferenceError: Cannot access '${name}' before ` +
              `initialization\` at ${escaped(file)}:\\d+:\\d+ — ${name} is read before its declaration ran`,
          ),
        );
        expect(finding).toContain(UNLINKED);
      }
    });

    it('reports a browser global read at the top level as a failure to import on a server', () => {
      const finding = about('@fixture/entry-points-broken/server');

      expect(finding).toMatch(
        /^\S+: evaluating it throws `ReferenceError: window is not defined` at dist\/server\.js:/,
      );
      expect(finding).toContain(`\`window\` ${SERVER}`);
      expect(finding).not.toContain(UNLINKED);
    });

    it('names the dependency that reads it when the read is not in the package', () => {
      const finding = about('@fixture/entry-points-broken/map');

      expect(finding).toContain(
        'throws `ReferenceError: document is not defined` at node_modules/fixture-map/index.js:3:13, ' +
          'inside fixture-map, which this entry point loads',
      );
      expect(finding).toContain(`\`document\` ${SERVER}`);
    });

    it('imports each entry point in a fresh process, because a warmed shared chunk hides the throw', () => {
      // In one process, the entry point that enters the cycle from the chunk's
      // side leaves the chunk evaluated, and the other one then loads.
      const shared = importInOneProcess(FIXTURES.entryPointsBroken, [
        '@fixture/entry-points-broken/cycle-a',
        '@fixture/entry-points-broken/cycle-b',
      ]);

      expect(shared).toEqual({ status: 0, stderr: '' });
      expect(about('@fixture/entry-points-broken/cycle-b')).toMatch(
        /throws `ReferenceError: Cannot access 'FixtureBase' before initialization` at dist\/cycle\/chunk\.js:/,
      );
    });

    it('passes once every finding is acknowledged in ignore', async () => {
      const ignore = ['.', './query', './host', './server', './map', './cycle-b'];

      expect(await unloadableEntryPoints({ packageDir: FIXTURES.entryPointsBroken, ignore })).toEqual([]);
    });

    it('reports an ignore entry that excuses nothing, saying why', async () => {
      const ignore = ['.', './query', './host', './server', './map', './cycle-b', './util', './gone', './package.json'];

      expect(await unloadableEntryPoints({ packageDir: FIXTURES.entryPointsBroken, ignore })).toEqual([
        'ignore lists "./util", and that entry point imports cleanly — the entry exempts nothing.',
        'ignore lists "./gone", which is not a subpath this check imports or reports — the entry exempts nothing.',
        'ignore lists "./package.json", which is not a subpath this check imports or reports — the entry exempts nothing.',
      ]);
    });
  });

  describe('on a package Node will not link', () => {
    it('reports what the loader refused as not probed, and never as a finding', async () => {
      const problems = await unloadableEntryPoints({ packageDir: FIXTURES.entryPointsUnlinked });

      expect(problems).toEqual([
        expect.stringMatching(
          /^fixture-entry-points-unlinked was not probed: .* — `SyntaxError: Named export 'debounce' not found\. /,
        ),
        expect.stringMatching(
          /^fixture-entry-points-unlinked\/phone was not probed: .*`TypeError \[ERR_IMPORT_ATTRIBUTE_MISSING\]: /,
        ),
        expect.stringMatching(
          /^fixture-entry-points-unlinked\/upgrade was not probed: .*`Error \[ERR_MODULE_NOT_FOUND\]: Cannot find package 'fixture-not-installed'/,
        ),
        'exports["./locales/*"] is a pattern and was not imported, so nothing behind it was probed. ' +
          'List its subpaths literally, or acknowledge it in `ignore`.',
        expect.stringMatching(/^no entry point was imported/),
      ]);
      for (const problem of problems.slice(0, 3)) expect(problem).toContain(REFUSED);
    });

    it('still reports a run that imported nothing when every line is acknowledged', async () => {
      // Acknowledging a subpath excuses the line about it. It does not turn
      // "nothing was evaluated" into "nothing was wrong".
      const problems = await unloadableEntryPoints({
        packageDir: FIXTURES.entryPointsUnlinked,
        ignore: ['.', './phone', './upgrade', './locales/*'],
      });

      expect(problems).toEqual([
        "no entry point was imported — each one is a pattern, was refused by Node's loader or ran out of time — " +
          'so nothing was evaluated.',
      ]);
    });
  });

  describe('with a preload', () => {
    it('reports a global the package expects a consumer to have defined first', async () => {
      const problems = await unloadableEntryPoints({ packageDir: FIXTURES.entryPointsLocalized });

      expect(problems).toHaveLength(1);
      expect(problems[0]).toMatch(
        /^fixture-entry-points-localized: evaluating it throws `ReferenceError: \$localize is not defined` at index\.js:3:\d+/,
      );
    });

    it('imports the preload first, resolved from the package', async () => {
      const problems = await unloadableEntryPoints({
        packageDir: FIXTURES.entryPointsLocalized,
        preload: ['fixture-localize/init'],
      });

      expect(problems).toEqual([]);
    });

    it('takes a path as a file, not as a specifier to resolve from the package', async () => {
      const problems = await unloadableEntryPoints({
        packageDir: FIXTURES.entryPointsLocalized,
        preload: [join(FIXTURES.entryPointsLocalized, 'node_modules/fixture-localize/init.js')],
      });

      expect(problems).toEqual([]);
    });

    it('throws rather than answering when a preload does not load', async () => {
      await expect(
        unloadableEntryPoints({ packageDir: FIXTURES.entryPointsLocalized, preload: ['fixture-not-installed/init'] }),
      ).rejects.toThrow(
        /^ngtrue: the preload "fixture-not-installed\/init", imported from .* threw `Error \[ERR_MODULE_NOT_FOUND\]/,
      );
    });
  });

  describe('on an import that does not settle', () => {
    let problems: readonly string[];
    beforeAll(async () => {
      problems = await unloadableEntryPoints({ packageDir: FIXTURES.entryPointsUnsettled, timeout: 2_000 });
    });

    it('reports a top-level await nothing settles, which Node gives up on', () => {
      expect(problems[0]).toMatch(/^fixture-entry-points-unsettled: importing it never finishes — .* exit code 13\./);
    });

    it('reports an import still running at the timeout as not probed', () => {
      expect(problems[1]).toMatch(
        /^fixture-entry-points-unsettled\/busy was not probed: importing it had not finished after 2000 ms/,
      );
    });

    it('reports a module that ends the process while it is imported', () => {
      expect(problems[2]).toBe(
        'fixture-entry-points-unsettled/exit: importing it ended the Node process (exit code 3) before the import settled.',
      );
      expect(problems).toHaveLength(3);
    });
  });

  describe('reports rather than passes a package it cannot import', () => {
    it('with no exports', async () => {
      expect(await unloadableEntryPoints({ packageDir: FIXTURES.noExports })).toEqual([
        expect.stringMatching(/^the manifest declares no `exports`, so there is no list of entry points to import/),
      ]);
    });

    it('with exports that hold no JavaScript', async () => {
      expect(await unloadableEntryPoints({ packageDir: FIXTURES.stylesheets })).toEqual([
        '`exports` lists no subpath with a JavaScript target, so there was nothing to import.',
      ]);
    });

    it('with no name to import it by', async () => {
      expect(await unloadableEntryPoints({ packageDir: FIXTURES.nameless })).toEqual([
        expect.stringMatching(/package\.json has no "name", so nothing can import it by a package specifier\.$/),
      ]);
    });

    it('with a name no package can be installed as', async () => {
      expect(await unloadableEntryPoints({ packageDir: FIXTURES.schematicsBadName })).toEqual([
        expect.stringMatching(/package\.json names itself "\.\.\/\.\.\/outside", which no package can be installed as/),
      ]);
    });
  });

  it('throws rather than answering when @angular/compiler does not resolve from the package', async () => {
    // A copy in the system temp directory, which has no `node_modules` above
    // it: every fixture in the repository resolves the repository's compiler.
    const outside = mkdtempSync(join(tmpdir(), 'ngtrue-entry-points-'));
    try {
      cpSync(FIXTURES.entryPointsLocalized, outside, { recursive: true });

      await expect(unloadableEntryPoints({ packageDir: outside })).rejects.toThrow(
        /^ngtrue: `unloadableEntryPoints` imports `@angular\/compiler` before every entry point, the way `ng test` does, and it does not resolve from /,
      );
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('refuses a timeout that is not a positive number of milliseconds', async () => {
    await expect(unloadableEntryPoints({ packageDir: FIXTURES.entryPointsSound, timeout: 0 })).rejects.toThrow(
      /^ngtrue: `timeout` is 0, and has to be a positive number of milliseconds\.$/,
    );
  });
});

function escaped(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}
