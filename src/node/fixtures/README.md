Packages for the checks in `src/node` to be pointed at.

Each is a whole package rather than a mock: the checks read `package.json` and
the filesystem, so a stub of either would only prove the stub matched what the
check expected. `sound/` is correct in every way the manifest and source checks
can measure, including the ways a correct package used to get reported — text in
its source that spells an import, a specifier that names no package (`~/x`), and
subpaths only a stylesheet compiler can reach; `broken/` is wrong in one way per
finding, and each fault is one a real build produces — a file the build stopped
emitting, a subpath with no `types` condition, a pattern that matches nothing,
an import nobody declared, a peer nobody imports. `broken/` also puts text that
only spells an import, and the two shapes a lexer most easily misreads, in front
of a real import of every form, because a scanner is wrong in two directions and
only that order shows both; and its schematics subtree imports a package the
Angular CLI supplies, which is a finding until `exclude` says the subtree runs
somewhere else. `stylesheets/` is a package only a Sass compiler can import,
which `unresolvableTypes` has to report as unprobed rather than pass.
`stylesheets-sound/` holds the stylesheet subpaths that two real packages got
reported for — ng-zorro-antd's `less` wildcards and angular-split's `css` theme
— beside a typed root, and `stylesheets-broken/` is the same package with a
`default` JavaScript target added to two of them, so a TypeScript import lands
there and both type checks have to name those two and only those.

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

`unexported-*/` are for `unexportedTypes`, which reads declaration files, so
each ships a `dist/` of hand-written `.d.ts` in the shape a multi-file `tsc`
build emits — a type declared in one file and never re-exported by the file a
subpath points at. `unexported-sound/` and `unexported-broken/` share every
declaration byte for byte and differ only in the re-export lines;
`unexported-sibling/` ships the broken `index.d.ts` unchanged and exports the
missing names from a second subpath, all but one; `unexported-private/` names
its unexported type only where a consumer is promised nothing, plus once where
it is, so the walk can be seen to have run; `unexported-empty/` exports only
what the check skips — a `ɵ`-prefixed constant and a namespace holding one
`@internal` function — which must be reported rather than passed;
`unexported-dangling/` is the sound package after a build that stopped emitting
`types.d.ts`, its `index.d.ts` unchanged; in `unexported-stale/` each
declaration file is from a different build and imports, by the package's own
name, something its neighbour did not have yet; `unexported-wildcard/` has a
type exported only through a pattern subpath and a subpath with no
declarations, so what is read can be told apart from what is acknowledged.

`declarations-sound/` and `declarations-broken/` are little Angular libraries
for `globalAttributeInputs`. Their sources are committed and their `dist/` is
not: `npm run fixtures` builds each with `ngc` in partial mode, the form a
published library ships, so the check always reads what the installed compiler
emits. Every class in them is one route an input can reach a host by — its own,
inherited, exposed by a host directive or by that directive's own host
directive — or one shape the check has to report rather than pass. Both are
built with standard decorators, so the class with a decorated field in each
comes out wrapped in a function with its base in a `_classSuper` local, the
shape ng-zorro-antd ships. `declarations-headless/` is a library of attribute
directives and an abstract base, nothing on a custom element, which has to be
told that and not that it was compiled in full mode.

The `angular-*` packages are Angular libraries for `angularPeerFloorsTooLow`,
each built one with its bundles in the shape the Angular package builders emit.
`angular-sound/` and `angular-prerelease/` link on every Angular their
`@angular/core` range admits. `angular-floor-low/` has the range
dmacfarlane/angular-mentions#238 reported, with the declaration that breaks it
in a chunk only a relative import reaches. `angular-service/` has an
`ɵɵngDeclareService` behind a wildcard subpath, under a range that admits 21.
`angular-deferred/` is a real `@angular/build:library` build whose `@defer`
block put the same kind of service in a chunk only `import()` reaches.
`angular-full/` is a full-compilation build with no declarations to read,
`angular-unreadable/` holds what the check has to report rather than skip, and
`angular-unbuilt/` is a manifest checked before its build ran, under a range no
version satisfies.

They are excluded from `tsconfig.build.json` and never published.
