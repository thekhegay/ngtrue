Packages for the checks in `src/node` to be pointed at.

Each is a whole package rather than a mock: the checks read `package.json` and
the filesystem, so a stub of either would only prove the stub matched what the
check expected. `sound/` is correct in every way the three checks can measure,
including the ways a correct package used to get reported — text in its source
that spells an import, a specifier that names no package (`~/x`), and subpaths
only a stylesheet compiler can reach; `broken/` is wrong in one way per finding,
and each fault is one a real build produces — a file the build stopped
emitting, a subpath with no `types` condition, a pattern that matches nothing,
an import nobody declared, a peer nobody imports. `broken/` also puts text that
only spells an import, and the two shapes a lexer most easily misreads, in front
of a real import of every form, because a scanner is wrong in two directions and
only that order shows both; and its schematics subtree imports a package the
Angular CLI supplies, which is a finding until `exclude` says the subtree runs
somewhere else. `stylesheets/` is a package only a Sass compiler can import,
which `unresolvableTypes` has to report as unprobed rather than pass.

The `schematics-*` packages are for `unloadableSchematics`, and they are
measured the way a consumer meets them: packed by `npm pack --dry-run`, copied
into a probe `node_modules`, and loaded by the devkit's own engine.
`schematics-sound/` is a `"type": "module"` package whose CommonJS schematics
sit under a nested `{ "type": "commonjs" }` manifest. `schematics-esm-scope/`
never wrote that manifest, and `schematics-ignored/` wrote it and then dropped
it from the tarball with the `**/package.json` line ng-packagr's `.npmignore`
carried. The rest hold one fault per finding: a factory that is not a function,
an export, schema or module that is not there, a migrations path the CLI would
refuse, an empty collection, and an encapsulated collection the check reports
as unchecked rather than judging with the wrong loader.

Three more hold the probe to the package it was pointed at.
`schematics-self-reference/` names its factory by package, which the devkit
alone resolves from its own install rather than from the staged copy.
`schematics-workspace-root/` is an npm workspace root whose own collection is
packed only when npm packs the root and not its member. `schematics-bad-name/`
has a name that would stage the package two directories above the probe.

They are excluded from `tsconfig.build.json` and never published.
