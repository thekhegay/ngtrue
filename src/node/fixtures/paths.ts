/**
 * Absolute paths to the fixture packages.
 *
 * `import.meta.dirname` rather than `process.cwd()`, which the test runner is
 * free to set anywhere, and rather than `fileURLToPath(import.meta.url)`, which
 * the runner rewrites to a non-file URL in a module it has transformed.
 */
const here = import.meta.dirname;

export const FIXTURES = {
  sound: `${here}/sound`,
  broken: `${here}/broken`,
  noExports: `${here}/no-exports`,
  nameless: `${here}/nameless`,
} as const;
