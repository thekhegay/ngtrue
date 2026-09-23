import { describe, expect, it } from 'vitest';

import { FIXTURES } from './fixtures/paths.js';
import { unresolvableTypes } from './unresolvable-types.js';

describe('unresolvableTypes', () => {
  it('finds nothing wrong with a package whose types resolve both ways', async () => {
    expect(await unresolvableTypes({ packageDir: FIXTURES.sound })).toEqual([]);
  });

  it('resolves a scoped name too, which needs the scope directory staged', async () => {
    // `@fixture/broken` cannot be symlinked into `node_modules` without creating
    // `node_modules/@fixture` first. The check below would fail with a
    // filesystem error rather than a finding if that were missed, so this
    // asserts the findings are about the package and not about the probe.
    const problems = await unresolvableTypes({ packageDir: FIXTURES.broken });

    expect(problems.every(problem => !problem.includes('ENOENT'))).toBe(true);
  });

  describe('on a package with no declarations behind a subpath', () => {
    it('names the subpath under both modes', async () => {
      const problems = await unresolvableTypes({ packageDir: FIXTURES.broken });
      const root = problems.filter(problem => problem.startsWith('@fixture/broken '));

      expect(root).toHaveLength(2);
      expect(root.some(problem => problem.includes('node16'))).toBe(true);
      expect(root.some(problem => problem.includes('bundler'))).toBe(true);
    });

    it('says the consumer gets `any`, which is the part that does not announce itself', async () => {
      const problems = await unresolvableTypes({ packageDir: FIXTURES.broken, modes: ['bundler'] });

      expect(problems.some(problem => problem.includes('not a declaration file'))).toBe(true);
    });
  });

  it('reports a wildcard subpath as unchecked rather than passing it', async () => {
    const problems = await unresolvableTypes({ packageDir: FIXTURES.broken, modes: ['bundler'] });

    expect(problems).toContain(
      'exports["./locales/*"] is a wildcard and was not probed — one sample would say nothing ' +
        'about the rest of the set. Check it by hand, or list the subpaths literally.',
    );
  });

  it('probes only the modes it is asked for', async () => {
    const both = await unresolvableTypes({ packageDir: FIXTURES.broken });
    const one = await unresolvableTypes({ packageDir: FIXTURES.broken, modes: ['node16'] });

    expect(one.length).toBeLessThan(both.length);
    expect(one.some(problem => problem.includes('bundler'))).toBe(false);
  });

  it('answers about the manifest when there is no name to import by', async () => {
    const problems = await unresolvableTypes({ packageDir: FIXTURES.nameless });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('no "name"');
  });
});
