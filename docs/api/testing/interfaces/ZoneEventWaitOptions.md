[ngtrue](../../index.md) / [testing](../index.md) / ZoneEventWaitOptions

# Interface: ZoneEventWaitOptions\<T\>

Defined in: [src/testing/zone-event-waits.ts:56](https://github.com/thekhegay/ngtrue/blob/main/src/testing/zone-event-waits.ts#L56)

Options for [assertNoZoneEventWaits](../functions/assertNoZoneEventWaits.md).

## Since

0.3.0

## Type Parameters

### T

`T` = `unknown`

## Properties

### act?

> `readonly` `optional` **act?**: (`fixture`) => `unknown`

Defined in: [src/testing/zone-event-waits.ts:66](https://github.com/thekhegay/ngtrue/blob/main/src/testing/zone-event-waits.ts#L66)

What to do with the fixture once it has rendered, so the subscriptions an
interaction makes are seen as well: open the overlay, hover the trigger,
scroll the list. It may return a promise, which is awaited, and the fixture
renders once more afterwards.

Only the paths the render and this callback reach are watched. A tooltip
that subscribes when it opens passes a run that never opens it.

#### Parameters

##### fixture

`ComponentFixture`\<`T`\>

#### Returns

`unknown`
