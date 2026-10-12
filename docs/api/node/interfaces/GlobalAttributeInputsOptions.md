[ngtrue](../../index.md) / [node](../index.md) / GlobalAttributeInputsOptions

# Interface: GlobalAttributeInputsOptions

Defined in: [src/node/global-attribute-inputs.ts:9](https://github.com/thekhegay/ngtrue/blob/main/src/node/global-attribute-inputs.ts#L9)

## Since

0.2.0

## Properties

### packageDir

> `readonly` **packageDir**: `string`

Defined in: [src/node/global-attribute-inputs.ts:15](https://github.com/thekhegay/ngtrue/blob/main/src/node/global-attribute-inputs.ts#L15)

The directory holding the `package.json` to check — the BUILT package, the
one that would be packed. The check reads the partial declarations in the
JavaScript it ships, so a source tree has nothing for it to read.

***

### ignore?

> `readonly` `optional` **ignore?**: readonly `string`[]

Defined in: [src/node/global-attribute-inputs.ts:29](https://github.com/thekhegay/ngtrue/blob/main/src/node/global-attribute-inputs.ts#L29)

Findings you have looked at and accepted.

`"WrFoo.title"` accepts one input: the component means the native attribute
to stay, or removes it in code where this check cannot see. A bare
`"WrFoo"` accepts that WrFoo could not be checked completely — it extends a
class from another package, or carries a host directive from one — and does
NOT silence its input findings, which keep being reported until each is
listed by name.

An entry that matches nothing is reported too, so the list cannot outlive
the code it excuses.
