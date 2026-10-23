[ngtrue](../../index.md) / [node](../index.md) / UnloadableEntryPointsOptions

# Interface: UnloadableEntryPointsOptions

Defined in: [src/node/unloadable-entry-points.ts:14](https://github.com/thekhegay/ngtrue/blob/main/src/node/unloadable-entry-points.ts#L14)

Options for [unloadableEntryPoints](../functions/unloadableEntryPoints.md).

## Since

0.3.0

## Properties

### packageDir

> `readonly` **packageDir**: `string`

Defined in: [src/node/unloadable-entry-points.ts:20](https://github.com/thekhegay/ngtrue/blob/main/src/node/unloadable-entry-points.ts#L20)

The directory holding the `package.json` to check — the BUILT package, the
one that would be packed. Its code is imported, so a source tree has
nothing to run.

***

### ignore?

> `readonly` `optional` **ignore?**: readonly `string`[]

Defined in: [src/node/unloadable-entry-points.ts:31](https://github.com/thekhegay/ngtrue/blob/main/src/node/unloadable-entry-points.ts#L31)

Subpaths, spelled as they are in `exports` (`"."`, `"./map"`,
`"./locales/*"`), whose finding or "not probed" line is a decision rather
than a defect: an entry point that only a browser is meant to load, a
pattern that cannot be imported literally, a subpath whose import Node's
loader refuses and a bundler does not.

An entry that excuses nothing is reported, so the list cannot outlive the
entry point it was written for.

***

### preload?

> `readonly` `optional` **preload?**: readonly `string`[]

Defined in: [src/node/unloadable-entry-points.ts:43](https://github.com/thekhegay/ngtrue/blob/main/src/node/unloadable-entry-points.ts#L43)

Modules to import before each entry point, after `@angular/compiler`, in
this order — what a consumer's test setup loads first, such as
`@angular/localize/init` for a library that calls `$localize` at the top
level of a module.

A bare specifier is resolved from `packageDir`, as the package's own
imports are; a path is resolved from the current directory. One that does
not load is an error rather than a finding, because it is a fact about the
call, not the package.

***

### timeout?

> `readonly` `optional` **timeout?**: `number`

Defined in: [src/node/unloadable-entry-points.ts:49](https://github.com/thekhegay/ngtrue/blob/main/src/node/unloadable-entry-points.ts#L49)

How long one entry point may take to import, in milliseconds, before its
process is stopped and the entry point reported as not probed. Defaults to
30 000.
