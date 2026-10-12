[ngtrue](../../index.md) / [node](../index.md) / unloadableSchematics

# Function: unloadableSchematics()

> **unloadableSchematics**(`options`): `Promise`\<readonly `string`[]\>

Defined in: [src/node/unloadable-schematics.ts:159](https://github.com/thekhegay/ngtrue/blob/main/src/node/unloadable-schematics.ts#L159)

Every schematic and `ng update` migration a package declares that the
Angular CLI cannot load, as one sentence each. An empty array is a pass.

```ts
it('ships schematics the CLI can load', async () => {
  expect(await unloadableSchematics({ packageDir: 'dist' })).toEqual([]);
});
```

## The failure it exists for

A library whose manifest says `"type": "module"` and whose schematics are
compiled to CommonJS ships `ng add`, `ng generate` and `ng update` that die on
load with `exports is not defined in ES module scope` — Node reads every
`.js` under that manifest as ESM, and the CLI loads factories with
`require()`. A nested `schematics/package.json` saying
`{ "type": "commonjs" }` scopes the folder back, and the fault is that it goes
missing: never written, or written and then left out of the tarball, which is
what ng-packagr's generated `.npmignore` did with `**/package.json`. Nothing
in a build notices, because nothing in a build loads a schematic, and the
library's own test suite runs the TypeScript sources through a runner that
does not care what the manifest says.

Other people reported it eight times against seven projects in 2026 alone —
ng-packagr/ng-packagr#3343, ngrx/platform#5216,
NG-ZORRO/ng-zorro-antd#9833, vmware-clarity/ng-clarity#2417 and #2454,
ng-primitives/ng-primitives#890, openng-org/optimus-ui#1557 and
Angular-Material-Dev/mat-exp#20 — and ngwr shipped it in every release from
7.0.0 to 9.1.0 before e83bcd10 wrote the nested manifest. ng-packagr#3344
fixed that `.npmignore`, which accounts for some of those reports and not for
a library that never wrote the manifest at all, as ng-primitives#890 had not.

## How it answers

**With the devkit's own engine**, not an imitation of it. The files that
would be packed are copied into a throwaway `node_modules` and the package is
resolved from there by `NodeModulesEngineHost` — the class the CLI's own
engine host extends — through `<name>/package.json` and the `exports` map,
the way `ng add` resolves it. Then every collection is created and every schematic
in it is created, which `require()`s its factory by the devkit's
`path#export` rule, reads its declared schema, and follows `extends`. What
throws is reported with the devkit's or Node's own message, and a factory
that loads but is not a function is reported as well, since the devkit
accepts it and only the run fails.

**The packed files, not the directory**, because the directory is not what
a consumer installs. A nested manifest on disk and out of the tarball is the
exact shape of ng-packagr#3343, and a check reading the directory passes it.
The list comes from `npm pack --dry-run --json --ignore-scripts` unless
`files` is given — without lifecycle scripts, because a check has no business
running a `prepack`.

**Under the current directory**, at `node_modules/.ngtrue-schematics-*`, and
removed afterwards. Factories `require` what the CLI supplies —
`@angular-devkit/schematics`, `@schematics/angular` — and in a consumer's
workspace those resolve from the workspace's `node_modules`. A probe in the
system temp directory has no such ancestor, so every factory that imports
the devkit would be reported for a reason no consumer ever meets.

`schematics` and `ng-update.migrations` are both read, and **declaring
neither is a finding**: the check was pointed at a package with nothing to
load, and an empty array would be true and would answer a question nobody
asked. So is a collection listing no schematics. A migrations path the CLI
would refuse (absolute, outside the package, not a string, not packed) is
reported in the CLI's own words.

**Every entry in a collection is loaded**, not only the ones a given command
would run. `ng update` creates every migration in the collection before it
filters them by version, so one unloadable old migration fails every later
update — ngrx/platform#5216 died in a 15.0.0 migration during an upgrade to
Angular 22. A hidden or private schematic is loaded too, since
`ng generate` or another schematic can still reach it.

**A factory named by package** rather than by relative path —
`my-lib/schematics/ng-add/index.js#default` — is resolved from the
collection's own directory, which is the CLI's first step too. The devkit
alone resolves it from its own install, which the staged copy is not under:
a working package would read `Cannot find module`, and in a repository that
links the library into its own `node_modules`, as every npm, pnpm and yarn
workspace does, the linked directory would be loaded instead of the tarball
and a dropped nested manifest would pass.

Paths in the messages read `node_modules/<name>/…`, which is where a consumer
would find the same file; the probe they were measured in is gone.

## What it does not check

**That a schematic works.** Loading runs each factory module's top-level code
and stops there: the rule the factory returns is never applied to a tree.
This answers the question every report above was about — the schematic never
started — and nothing after it.

**The packages the CLI supplies have to be installed where it runs.** A
factory importing `@schematics/angular` is reported with Node's
`Cannot find module` when the repository running the check has none, which
is a fact about that repository, not the package, and the same goes for a
collection that `extends` one of theirs. A library that builds schematics
has them as dev dependencies already. The check itself needs
`@angular-devkit/schematics`, an optional peer of ngtrue, and throws rather
than passing when it is absent.

**The answer is this Node's answer**, as the CLI's is the consumer's. A
true-ESM factory loads through `require()` on every Node the current CLI
supports and would not have on older ones.

**A collection with `"encapsulation": true` is reported as unchecked**, not
passed. The CLI loads those through its own VM wrapper, which ignores the
manifest's `type`, so a plain `require()` would answer for a loader the CLI
does not use. The CLI tests the field for truthiness, so any truthy value
counts, not only `true`. The CLI also wraps `@angular/*`, `@schematics/*` and
`@nguniversal/*` by default and honours `NG_SCHEMATIC_REDIRECT`; neither is
modelled, the first because only Angular publishes under those scopes, the
second because it is the consumer's environment rather than the package's.

**What a registry says about the package is invisible.** The CLI reads
`schematics` and `ng-update` from registry metadata before installing, and a
registry that leaves them out — angular-cli#33060, #33717 — breaks `ng add`
and `ng update` for a tarball this check passes.

**Builders and migration versions are left out.** Builders load through a
different host with its own rules, and a version string the CLI coerces into
something unexpected is a separate question; neither has the provenance yet.

It mirrors a CLI that loads with `require()`. If the CLI moves to `import()`,
the type-scope failure changes shape and this check has to move with it.

## Parameters

### options

[`UnloadableSchematicsOptions`](../interfaces/UnloadableSchematicsOptions.md)

## Returns

`Promise`\<readonly `string`[]\>

## Since

0.2.0
