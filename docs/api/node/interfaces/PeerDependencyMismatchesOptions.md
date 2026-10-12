[ngtrue](../../index.md) / [node](../index.md) / PeerDependencyMismatchesOptions

# Interface: PeerDependencyMismatchesOptions

Defined in: [src/node/peer-dependency-mismatches.ts:10](https://github.com/thekhegay/ngtrue/blob/main/src/node/peer-dependency-mismatches.ts#L10)

## Since

0.1.0

## Properties

### packageDir

> `readonly` **packageDir**: `string`

Defined in: [src/node/peer-dependency-mismatches.ts:12](https://github.com/thekhegay/ngtrue/blob/main/src/node/peer-dependency-mismatches.ts#L12)

The directory holding the `package.json` to check.

***

### sourceDir?

> `readonly` `optional` **sourceDir?**: `string`

Defined in: [src/node/peer-dependency-mismatches.ts:17](https://github.com/thekhegay/ngtrue/blob/main/src/node/peer-dependency-mismatches.ts#L17)

The directory holding the sources that SHIP, relative to `packageDir` or
absolute. Defaults to `src`.

***

### tsconfig?

> `readonly` `optional` **tsconfig?**: `string`

Defined in: [src/node/peer-dependency-mismatches.ts:25](https://github.com/thekhegay/ngtrue/blob/main/src/node/peer-dependency-mismatches.ts#L25)

A build tsconfig whose `exclude` says which files do not ship.

Prefer this to restating the list in [exclude](#exclude). The compiler already
knows what is left out of the package, and a second copy means two lists
that agree until someone adds a third kind of test file to one of them.

***

### exclude?

> `readonly` `optional` **exclude?**: readonly `string`[]

Defined in: [src/node/peer-dependency-mismatches.ts:47](https://github.com/thekhegay/ngtrue/blob/main/src/node/peer-dependency-mismatches.ts#L47)

Patterns for files to leave out, relative to `packageDir`. `*` matches
within a path segment, `**` across segments, and a pattern that names a
directory leaves out everything under it — the reading TypeScript gives
its own `exclude`.

**With `tsconfig`, these are added to its list**, and that is what they are
for there: a subtree that ships and runs inside somebody else's program.
Schematics are the case that needed it. The Angular CLI runs them and
brings `@angular-devkit/schematics` and `@schematics/angular` itself, so a
library imports both from `schematics/` and declares neither — on ngwr
those were two of this check's eleven findings, and its own spec had
skipped the directory for exactly that reason (`SKIP = ['schematics',
'mcp']`, ngwr faf216cd). The build tsconfig cannot say so, because the
files are not left out of the package; they are left out of this question.
`exclude: ['schematics']` beside `tsconfig` says it.

**Without `tsconfig`, they replace the default list** — specs, tests,
declaration files and fixtures — so a caller who passes them owns the whole
list.

***

### ignore?

> `readonly` `optional` **ignore?**: readonly `string`[]

Defined in: [src/node/peer-dependency-mismatches.ts:53](https://github.com/thekhegay/ngtrue/blob/main/src/node/peer-dependency-mismatches.ts#L53)

Packages to leave out of both directions, for the cases neither a manifest
nor a source scan can settle — a peer that exists to pin a transitive
range, or an import a bundler replaces.
