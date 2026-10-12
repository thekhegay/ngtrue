[ngtrue](../../index.md) / [node](../index.md) / AngularPeerFloorsTooLowOptions

# Interface: AngularPeerFloorsTooLowOptions

Defined in: [src/node/angular-peer-floors-too-low.ts:11](https://github.com/thekhegay/ngtrue/blob/main/src/node/angular-peer-floors-too-low.ts#L11)

Options for [angularPeerFloorsTooLow](../functions/angularPeerFloorsTooLow.md).

## Since

0.2.0

## Properties

### packageDir

> `readonly` **packageDir**: `string`

Defined in: [src/node/angular-peer-floors-too-low.ts:17](https://github.com/thekhegay/ngtrue/blob/main/src/node/angular-peer-floors-too-low.ts#L17)

The directory holding the `package.json` to check — the BUILT package, the
one that would be packed. The declarations this reads exist only in the
compiled output, so pointed at a source tree it reads nothing, and says so.
