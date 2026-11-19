[ngtrue](../../index.md) / [node](../index.md) / UnresolvableTypesOptions

# Interface: UnresolvableTypesOptions

Defined in: [src/node/unresolvable-types.ts:19](https://github.com/thekhegay/ngtrue/blob/main/src/node/unresolvable-types.ts#L19)

Options for [unresolvableTypes](../functions/unresolvableTypes.md).

## Since

0.1.0

## Properties

### packageDir

> `readonly` **packageDir**: `string`

Defined in: [src/node/unresolvable-types.ts:21](https://github.com/thekhegay/ngtrue/blob/main/src/node/unresolvable-types.ts#L21)

The directory holding the `package.json` to check — the BUILT package.

***

### modes?

> `readonly` `optional` **modes?**: readonly [`ResolutionMode`](../type-aliases/ResolutionMode.md)[]

Defined in: [src/node/unresolvable-types.ts:27](https://github.com/thekhegay/ngtrue/blob/main/src/node/unresolvable-types.ts#L27)

Which modes to probe. Both by default, and both is the point: `bundler` is
forgiving in ways `node16` is not, so a package checked only under the mode
its own repository uses will still break for half its consumers.

***

### ignore?

> `readonly` `optional` **ignore?**: readonly `string`[]

Defined in: [src/node/unresolvable-types.ts:50](https://github.com/thekhegay/ngtrue/blob/main/src/node/unresolvable-types.ts#L50)

Subpaths, spelled as they are in `exports` (`"./schematics/*"`), whose
findings are decisions rather than defects.

A wildcard listed here is acknowledged as unprobed: ngwr's
`"./i18n/*.json"` locale catalogues and `"./schematics/*"` factories are
not for a TypeScript import to reach, and ngwr excused the two sentences
about them by their opening words for want of this. A literal subpath
listed here is still probed under every mode, and what it reports is
excused — a bare string naming a `.css` file, say, which no TypeScript
import is meant to resolve.

A specifier of another package, exactly as a finding prints it, or the
package's name, excuses the imports of it that the second lane reads — the
way to acknowledge an optional peer that is not installed.

An entry that exempts nothing is reported: a subpath whose types resolve,
one skipped as a stylesheet, one the manifest does not have, a specifier
nothing imports. An exemption
list is a claim about the package, and one that outlived the thing it
excused says something false the next time somebody reads it.
