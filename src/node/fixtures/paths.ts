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
  stylesheetsSound: `${here}/stylesheets-sound`,
  stylesheetsBroken: `${here}/stylesheets-broken`,
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
  unexportedSound: `${here}/unexported-sound`,
  unexportedBroken: `${here}/unexported-broken`,
  unexportedSibling: `${here}/unexported-sibling`,
  unexportedPrivate: `${here}/unexported-private`,
  unexportedEmpty: `${here}/unexported-empty`,
  unexportedDangling: `${here}/unexported-dangling`,
  unexportedWildcard: `${here}/unexported-wildcard`,
  unexportedStale: `${here}/unexported-stale`,
  declarationsSound: `${here}/declarations-sound`,
  declarationsBroken: `${here}/declarations-broken`,
  declarationsHeadless: `${here}/declarations-headless`,
  angularSound: `${here}/angular-sound`,
  angularFloorLow: `${here}/angular-floor-low`,
  angularService: `${here}/angular-service`,
  angularDeferred: `${here}/angular-deferred`,
  angularPrerelease: `${here}/angular-prerelease`,
  angularFull: `${here}/angular-full`,
  angularUnreadable: `${here}/angular-unreadable`,
  angularUnbuilt: `${here}/angular-unbuilt`,
} as const;
