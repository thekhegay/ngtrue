[ngtrue](../../index.md) / [node](../index.md) / PeerDependencyMismatchesOptions

# Interface: PeerDependencyMismatchesOptions

Defined in: [src/node/peer-dependency-mismatches.ts:8](https://github.com/thekhegay/ngtrue/blob/main/src/node/peer-dependency-mismatches.ts#L8)

Options for [peerDependencyMismatches](../functions/peerDependencyMismatches.md).

## Properties

### packageDir

> `readonly` **packageDir**: `string`

Defined in: [src/node/peer-dependency-mismatches.ts:10](https://github.com/thekhegay/ngtrue/blob/main/src/node/peer-dependency-mismatches.ts#L10)

The directory holding the `package.json` to check.

***

### sourceDir?

> `readonly` `optional` **sourceDir?**: `string`

Defined in: [src/node/peer-dependency-mismatches.ts:15](https://github.com/thekhegay/ngtrue/blob/main/src/node/peer-dependency-mismatches.ts#L15)

The directory holding the sources that SHIP, relative to `packageDir` or
absolute. Defaults to `src`.

***

### tsconfig?

> `readonly` `optional` **tsconfig?**: `string`

Defined in: [src/node/peer-dependency-mismatches.ts:23](https://github.com/thekhegay/ngtrue/blob/main/src/node/peer-dependency-mismatches.ts#L23)

A build tsconfig whose `exclude` says which files do not ship.

Prefer this to [exclude](#exclude). The compiler already knows what is left out
of the package, and restating it here means two lists that agree until
someone adds a third kind of test file to one of them.

***

### exclude?

> `readonly` `optional` **exclude?**: readonly `string`[]

Defined in: [src/node/peer-dependency-mismatches.ts:28](https://github.com/thekhegay/ngtrue/blob/main/src/node/peer-dependency-mismatches.ts#L28)

Glob-ish patterns for files that do not ship, used when `tsconfig` is not
given. `*` matches within a path segment, `**` across segments.

***

### ignore?

> `readonly` `optional` **ignore?**: readonly `string`[]

Defined in: [src/node/peer-dependency-mismatches.ts:34](https://github.com/thekhegay/ngtrue/blob/main/src/node/peer-dependency-mismatches.ts#L34)

Packages to leave out of both directions, for the cases neither a manifest
nor a source scan can settle — a peer that exists to pin a transitive
range, or an import a bundler replaces.
