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
