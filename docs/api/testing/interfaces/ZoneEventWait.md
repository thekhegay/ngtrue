[ngtrue](../../index.md) / [testing](../index.md) / ZoneEventWait

# Interface: ZoneEventWait

Defined in: [src/testing/zone-event-waits.ts:9](https://github.com/thekhegay/ngtrue/blob/main/src/testing/zone-event-waits.ts#L9)

One subscription [assertNoZoneEventWaits](../functions/assertNoZoneEventWaits.md) saw.

## Since

0.3.0

## Properties

### event

> `readonly` **event**: `"onStable"` \| `"onMicrotaskEmpty"`

Defined in: [src/testing/zone-event-waits.ts:11](https://github.com/thekhegay/ngtrue/blob/main/src/testing/zone-event-waits.ts#L11)

The `NgZone` event that was subscribed to.

***

### at

> `readonly` **at**: `string` \| `undefined`

Defined in: [src/testing/zone-event-waits.ts:19](https://github.com/thekhegay/ngtrue/blob/main/src/testing/zone-event-waits.ts#L19)

The stack frame that subscribed: the first one outside `node_modules`, so
the line in the library's own code, or the line that called the dependency
that did. `undefined` when the subscription was already in place before the
fixture was created, which leaves no stack of it to read.
