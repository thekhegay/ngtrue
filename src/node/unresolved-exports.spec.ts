import { describe, expect, it } from 'vitest';

import { FIXTURES } from './fixtures/paths.js';
import { unresolvedExports } from './unresolved-exports.js';

describe('unresolvedExports', () => {
  it('finds nothing wrong with a package that ships what it advertises', () => {
    expect(unresolvedExports({ packageDir: FIXTURES.sound })).toEqual([]);
  });

  describe('on a package whose manifest has drifted from its build', () => {
    const problems = unresolvedExports({ packageDir: FIXTURES.broken });

    it('names a subpath pointing at a file that is not there', () => {
      expect(problems).toContain(
        'exports["./gone"] (condition "types") points at ./dist/gone.d.ts, which does not exist.',
      );
      expect(problems).toContain(
        'exports["./gone"] (condition "default") points at ./dist/gone.js, which does not exist.',
      );
    });

    it('reports a condition a consumer takes even when this process would not', () => {
      // The whole reason to walk every branch rather than the one that happens
      // to be live here: a `types`-only fault is invisible to a test suite that
      // imports at runtime, and to everyone on the team who only ever imports.
      expect(problems.some(problem => problem.includes('condition "types"'))).toBe(true);
    });

    it('names a target that is a directory', () => {
      expect(problems).toContain(
        'exports["./folder"] points at ./dist, which is a directory — Node will not resolve it.',
      );
    });

    it('names a target Node rejects outright for not starting with "./"', () => {
      expect(problems).toContain(
        'exports["./absolute"] is `dist/index.js`, which Node rejects: a target must start with "./".',
      );
    });

    it('names a wildcard subpath that expands to nothing', () => {
      expect(
        problems.some(problem => problem.startsWith('exports["./locales/*"]') && problem.includes('matches no file')),
      ).toBe(true);
    });

    it('leaves the subpath that is actually fine alone', () => {
      expect(problems.some(problem => problem.startsWith('exports["."]'))).toBe(false);
    });
  });

  it('says so when a package has no `exports` at all, rather than passing it', () => {
    // An empty problem list here would mean "everything advertised resolves",
    // which is true and useless: with no `exports` the package advertises every
    // file it contains. Silence would be the wrong answer to a different
    // question than the one that was asked.
    const problems = unresolvedExports({ packageDir: FIXTURES.noExports });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('declares no `exports`');
  });
});
