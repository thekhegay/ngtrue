[ngtrue](../../index.md) / [node](../index.md) / UnresolvableTypesOptions

# Interface: UnresolvableTypesOptions

Defined in: [src/node/unresolvable-types.ts:13](https://github.com/thekhegay/ngtrue/blob/main/src/node/unresolvable-types.ts#L13)

Options for [unresolvableTypes](../functions/unresolvableTypes.md).

## Properties

### packageDir

> `readonly` **packageDir**: `string`

Defined in: [src/node/unresolvable-types.ts:15](https://github.com/thekhegay/ngtrue/blob/main/src/node/unresolvable-types.ts#L15)

The directory holding the `package.json` to check — the BUILT package.

***

### modes?

> `readonly` `optional` **modes?**: readonly [`ResolutionMode`](../type-aliases/ResolutionMode.md)[]

Defined in: [src/node/unresolvable-types.ts:21](https://github.com/thekhegay/ngtrue/blob/main/src/node/unresolvable-types.ts#L21)

Which modes to probe. Both by default, and both is the point: `bundler` is
forgiving in ways `node16` is not, so a package checked only under the mode
its own repository uses will still break for half its consumers.

***

### ignore?

> `readonly` `optional` **ignore?**: readonly `string`[]

Defined in: [src/node/unresolvable-types.ts:39](https://github.com/thekhegay/ngtrue/blob/main/src/node/unresolvable-types.ts#L39)

Subpaths, spelled as they are in `exports` (`"./schematics/*"`), whose
findings are decisions rather than defects.

A wildcard listed here is acknowledged as unprobed: ngwr's
`"./i18n/*.json"` locale catalogues and `"./schematics/*"` factories are
not for a TypeScript import to reach, and ngwr excused the two sentences
about them by their opening words for want of this. A literal subpath
listed here is still probed under every mode, and what it reports is
excused — a bare string naming a `.css` file, say, which no TypeScript
import is meant to resolve.

An entry that exempts nothing is reported: a subpath whose types resolve,
one skipped as a stylesheet, one the manifest does not have. An exemption
list is a claim about the package, and one that outlived the thing it
excused says something false the next time somebody reads it.
