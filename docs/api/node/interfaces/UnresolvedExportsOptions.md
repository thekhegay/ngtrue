[ngtrue](../../index.md) / [node](../index.md) / UnresolvedExportsOptions

# Interface: UnresolvedExportsOptions

Defined in: [src/node/unresolved-exports.ts:8](https://github.com/thekhegay/ngtrue/blob/main/src/node/unresolved-exports.ts#L8)

## Since

0.1.0

## Properties

### packageDir

> `readonly` **packageDir**: `string`

Defined in: [src/node/unresolved-exports.ts:17](https://github.com/thekhegay/ngtrue/blob/main/src/node/unresolved-exports.ts#L17)

The directory holding the `package.json` to check.

Point this at the BUILT package — the directory that would be packed — and
not at the repository root, unless the two are the same. An `exports` map
describing `./dist/...` resolves against the repository fine and says
nothing about what npm actually shipped.
