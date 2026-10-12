# unloadableSchematics

`ngtrue/node`

Every schematic and `ng update` migration your package declares that the
Angular CLI **cannot load**, as one sentence each. An empty array is a pass.

## A runnable example

```ts
import { unloadableSchematics } from 'ngtrue/node';

it('ships schematics the CLI can load', async () => {
  expect(await unloadableSchematics({ packageDir: 'dist' })).toEqual([]);
});
```

Point it at the built package, the directory you would publish. It needs
`@angular-devkit/schematics` installed, which an Angular repository has already.

If npm is not your packer, hand it the file list yourself:

```ts
await unloadableSchematics({ packageDir: 'dist', files: listFromYourPacker });
```

## The failure it exists for

Your `package.json` says `"type": "module"`, your schematics are compiled to
CommonJS, and `ng add` dies before doing anything:

```
An unhandled exception occurred: exports is not defined in ES module scope
```

Node reads every `.js` file under that manifest as ESM, and the CLI loads
factories with `require()`. The fix is a nested `schematics/package.json` saying
`{ "type": "commonjs" }`, and the failure is that it goes missing: never
written, or written and then left out of the tarball. ng-packagr's generated
`.npmignore` dropped it with `**/package.json`.

Nothing in a build notices, because nothing in a build loads a schematic, and
your test suite runs the TypeScript sources without asking what the manifest
says. The first person to find out is a consumer running `ng update`.

## How it answers

**With the devkit's own engine.** The files that would be packed are copied
into a throwaway `node_modules` and the package is resolved from there by
`NodeModulesEngineHost`, the engine host the CLI's own engine host extends:
through `<name>/package.json` and your `exports` map, the way `ng add` resolves
it. Then every schematic in `schematics` and in `ng-update.migrations` is
created, which `require()`s its factory, reads its schema and follows
`extends`. What throws is reported in the devkit's or Node's own words.

**The packed files, not the directory.** A nested manifest that is on disk and
missing from the tarball is exactly how ng-packagr shipped the bug, and a check
that read the directory would pass it. The list comes from
`npm pack --dry-run --json --ignore-scripts`, unless you pass `files`.

**Under your current directory**, in `node_modules/.ngtrue-schematics-*`,
removed afterwards. Factories `require` what the CLI supplies, such as
`@angular-devkit/schematics` and `@schematics/angular`, and in a consumer's
workspace those resolve from the workspace's `node_modules`. A probe in the
system temp directory would report every one of them as missing.

A factory named by package rather than by relative path, such as
`my-lib/schematics/ng-add/index.js#default`, is resolved from the collection's
own directory, the way the CLI resolves it. That keeps it on the packed copy
even in a workspace that links your library into its own `node_modules`, where
the files on disk would otherwise stand in for the tarball.

Paths in the messages read `node_modules/<name>/…`, which is where a consumer
would find the same file.

## What counts as a finding

- A schematic or migration whose factory, schema or module throws on load.
- A factory that loads but is not a function. The devkit accepts it, and the
  CLI fails only when it runs it.
- A collection that lists no schematics. Nothing was loaded, so nothing was
  checked, and an empty array would say otherwise.
- A manifest that declares neither `schematics` nor `ng-update.migrations`, for
  the same reason.
- A migrations path the CLI refuses: not a string, absolute, outside the
  package, or not in the packed files. The message quotes the CLI's own error.

Every entry is loaded, not only the ones a given command would run.
`ng update` creates every migration in the collection before it filters them by
version, so one broken old migration fails every later update. Hidden and
private schematics are loaded too: a hidden one is still an `ng generate`
target, and another schematic can still call a private one.

## What it does not check

**That a schematic works.** Loading runs each factory module's top-level code
and stops there: the rule it returns is never applied to a tree. Every report
behind this check was about a schematic that never started, and that is the
question it answers.

**The packages the CLI supplies have to be installed where it runs.** Run from a
directory without `@schematics/angular` and a factory importing it is reported
with `Cannot find module`. That is a fact about the directory, not the package.

**The answer is this Node's answer**, just as the CLI's answer is your
consumer's Node.

**A collection with `"encapsulation": true` is reported as unchecked.** The CLI
loads those through its own wrapper, which ignores `type`, so a plain
`require()` would answer for a loader the CLI does not use.

**What a registry says about the package.** The CLI reads `schematics` and
`ng-update` from registry metadata before it installs anything, and some
registries leave them out. This check reads the tarball.

**Builders and migration version strings** are out of scope for now.
