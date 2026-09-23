[ngtrue](../../index.md) / [node](../index.md) / UnresolvableTypesOptions

# Interface: UnresolvableTypesOptions

Defined in: src/node/unresolvable-types.ts:11

Options for [unresolvableTypes](../functions/unresolvableTypes.md).

## Properties

### packageDir

> `readonly` **packageDir**: `string`

Defined in: src/node/unresolvable-types.ts:13

The directory holding the `package.json` to check — the BUILT package.

***

### modes?

> `readonly` `optional` **modes?**: readonly [`ResolutionMode`](../type-aliases/ResolutionMode.md)[]

Defined in: src/node/unresolvable-types.ts:19

Which modes to probe. Both by default, and both is the point: `bundler` is
forgiving in ways `node16` is not, so a package checked only under the mode
its own repository uses will still break for half its consumers.
