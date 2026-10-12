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
  stylesheets: `${here}/stylesheets`,
  schematicsSound: `${here}/schematics-sound`,
  schematicsEsmScope: `${here}/schematics-esm-scope`,
  schematicsIgnored: `${here}/schematics-ignored`,
  schematicsFaults: `${here}/schematics-faults`,
  schematicsRefused: `${here}/schematics-refused`,
  schematicsEmpty: `${here}/schematics-empty`,
  schematicsEncapsulated: `${here}/schematics-encapsulated`,
  schematicsSelfReference: `${here}/schematics-self-reference`,
  schematicsWorkspaceRoot: `${here}/schematics-workspace-root`,
  schematicsBadName: `${here}/schematics-bad-name`,
} as const;
