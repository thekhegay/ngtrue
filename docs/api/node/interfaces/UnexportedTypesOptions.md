[ngtrue](../../index.md) / [node](../index.md) / UnexportedTypesOptions

# Interface: UnexportedTypesOptions

Defined in: [src/node/unexported-types.ts:14](https://github.com/thekhegay/ngtrue/blob/main/src/node/unexported-types.ts#L14)

Options for [unexportedTypes](../functions/unexportedTypes.md).

## Since

0.2.0

## Properties

### packageDir

> `readonly` **packageDir**: `string`

Defined in: [src/node/unexported-types.ts:16](https://github.com/thekhegay/ngtrue/blob/main/src/node/unexported-types.ts#L16)

The directory holding the `package.json` to check — the BUILT package, whose declarations a consumer reads.

***

### ignore?

> `readonly` `optional` **ignore?**: readonly `string`[]

Defined in: [src/node/unexported-types.ts:35](https://github.com/thekhegay/ngtrue/blob/main/src/node/unexported-types.ts#L35)

Findings that are decisions rather than defects, each spelled one of two
ways.

- **A declaration's name**, exactly as a finding prints it, for a type that
  is meant to stay unnameable — a brand, a base class the package does not
  want subclassed from outside. It exempts that declaration wherever a
  public signature names it, and every other unexported declaration that
  happens to share the name. A name that does not resolve at all cannot be
  exempted: a declaration file that is missing is not a decision.
- **A subpath**, spelled as it is in `exports` (`"./schematics/*"`), to
  acknowledge that a wildcard cannot be read, or that a subpath does not
  load as declarations on purpose.

An entry that exempts nothing is reported. An exemption list is a claim
about the package, and one that outlived the thing it excused says
something false the next time somebody reads it.
