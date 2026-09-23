[ngtrue](../../index.md) / [node](../index.md) / UnresolvedExportsOptions

# Interface: UnresolvedExportsOptions

Defined in: src/node/unresolved-exports.ts:7

Options for [unresolvedExports](../functions/unresolvedExports.md).

## Properties

### packageDir

> `readonly` **packageDir**: `string`

Defined in: src/node/unresolved-exports.ts:16

The directory holding the `package.json` to check.

Point this at the BUILT package — the directory that would be packed — and
not at the repository root, unless the two are the same. An `exports` map
describing `./dist/...` resolves against the repository fine and says
nothing about what npm actually shipped.
