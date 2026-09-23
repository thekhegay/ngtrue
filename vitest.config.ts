import { resolve } from 'node:path';

import { defineConfig, type Plugin } from 'vitest/config';

const FIXTURE_SOURCE = resolve(import.meta.dirname, 'src/testing/fixtures/controls.ts');
const FIXTURE_COMPILED = resolve(import.meta.dirname, '.fixtures/controls.js');

/**
 * The spec imports the fixture SOURCE; the run loads the compiled fixture.
 *
 * The fixtures are the only Angular components in the repository, and they have
 * to be compiled ahead of time. Angular's JIT compiler cannot see `input()`,
 * `model()` or `output()`: they are initializer APIs, so the inputs and outputs
 * they declare exist only after static analysis, and a JIT-compiled control
 * comes out with an EMPTY definition. The conformance suite reads exactly that
 * definition, and any control worth checking is written with `model()` — so JIT
 * fixtures would have the suite proving itself against controls nobody writes.
 * `npm run fixtures` compiles them with `ngc`, into `.fixtures/`.
 *
 * Pointing the spec at `.fixtures/` directly is what this plugin avoids, and
 * the reason is not aesthetics: `.fixtures/` is generated, so an import of it
 * makes `tsc --noEmit` and eslint fail on a clean checkout, and fail in an
 * editor opened before anything has been built. Importing the source keeps the
 * fixtures typechecked and linted like every other file, and confines the
 * generated artefact to the one place that needs it — here.
 *
 * `ngc` rather than a vite plugin that would do this inline, because every such
 * plugin requires `@angular/build`: a whole build system this package does not
 * otherwise have, for two dozen lines of fixture. The spec hosts that bind
 * these controls are compiled just-in-time at run time, which Angular handles
 * for a plain template.
 */
const compiledFixtures: Plugin = {
  name: 'ngtrue:compiled-fixtures',
  enforce: 'pre',
  resolveId(source, importer) {
    if (importer === undefined) return null;
    const asSource = resolve(importer, '..', source).replace(/\.js$/, '.ts');
    return asSource === FIXTURE_SOURCE ? FIXTURE_COMPILED : null;
  },
};

export default defineConfig({
  plugins: [compiledFixtures],
  test: {
    environment: 'jsdom',
    globals: false,
    include: ['src/**/*.spec.ts'],
    // `src/node/fixtures/sound/src/index.spec.ts` is data: it exists so the
    // peer-dependency scan has a test-only import to ignore, and it declares no
    // suite. Collected, it fails the run with "no test suite found".
    exclude: ['**/node_modules/**', 'src/**/fixtures/**'],
    setupFiles: ['src/testing/fixtures/test-setup.ts'],
  },
});
