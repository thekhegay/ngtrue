[ngtrue](../../index.md) / [node](../index.md) / GlobalAttributeInputsOptions

# Interface: GlobalAttributeInputsOptions

Defined in: [src/node/global-attribute-inputs.ts:15](https://github.com/thekhegay/ngtrue/blob/main/src/node/global-attribute-inputs.ts#L15)

## Since

0.2.0

## Properties

### packageDir

> `readonly` **packageDir**: `string`

Defined in: [src/node/global-attribute-inputs.ts:24](https://github.com/thekhegay/ngtrue/blob/main/src/node/global-attribute-inputs.ts#L24)

The directory holding the `package.json` to check — the BUILT package, the
one that would be packed. The check reads the partial declarations in the
JavaScript it ships, so a source tree has nothing for it to read. Its
dependencies are read from the `node_modules` above it, so point it at a
build that sits where they are installed, as a `dist/` in the repository
that built it does.

***

### ignore?

> `readonly` `optional` **ignore?**: readonly `string`[]

Defined in: [src/node/global-attribute-inputs.ts:38](https://github.com/thekhegay/ngtrue/blob/main/src/node/global-attribute-inputs.ts#L38)

Findings you have looked at and accepted.

`"WrFoo.title"` accepts one input: the component means the native attribute
to stay, or removes it in code where this check cannot see. A bare
`"WrFoo"` accepts that WrFoo could not be checked completely — it extends a
class, or carries a host directive, from a package that is not installed or
in a form the check cannot follow — and does NOT silence its input findings,
which keep being reported until each is listed by name.

An entry that matches nothing is reported too, so the list cannot outlive
the code it excuses.
