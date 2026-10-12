[ngtrue](../../index.md) / [node](../index.md) / UnloadableSchematicsOptions

# Interface: UnloadableSchematicsOptions

Defined in: [src/node/unloadable-schematics.ts:13](https://github.com/thekhegay/ngtrue/blob/main/src/node/unloadable-schematics.ts#L13)

Options for [unloadableSchematics](../functions/unloadableSchematics.md).

## Since

0.2.0

## Properties

### packageDir

> `readonly` **packageDir**: `string`

Defined in: [src/node/unloadable-schematics.ts:18](https://github.com/thekhegay/ngtrue/blob/main/src/node/unloadable-schematics.ts#L18)

The directory holding the `package.json` to check — the BUILT package, the
one that would be packed.

***

### files?

> `readonly` `optional` **files?**: readonly `string`[]

Defined in: [src/node/unloadable-schematics.ts:27](https://github.com/thekhegay/ngtrue/blob/main/src/node/unloadable-schematics.ts#L27)

The files that would be packed, relative to `packageDir`. Defaults to what
`npm pack --dry-run` lists there.

Pass it when npm is not the packer — a list from another tool, or one a
build script already holds. It must name `package.json`, because every
packer includes it and a list without it was not produced by one.
