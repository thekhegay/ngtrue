[ngtrue](../../index.md) / [testing](../index.md) / assertNoZoneEventWaits

# Function: assertNoZoneEventWaits()

> **assertNoZoneEventWaits**\<`T`\>(`create`, `options?`): `Promise`\<`void`\>

Defined in: [src/testing/zone-event-waits.ts:198](https://github.com/thekhegay/ngtrue/blob/main/src/testing/zone-event-waits.ts#L198)

Assert that nothing a fixture renders, or does when it is used, subscribes to
`NgZone.onStable` or `NgZone.onMicrotaskEmpty` — the two events a zoneless
application never emits.

Give it a factory, and an `act` for the paths a render does not reach:

```ts
it('waits for nothing a zoneless app never emits', async () => {
  await assertNoZoneEventWaits(() => TestBed.createComponent(MyTooltip), {
    act: fixture => fixture.nativeElement.dispatchEvent(new MouseEvent('mouseenter')),
  });
});
```

## The defect

Zoneless change detection is the default for new applications since Angular
21. Without zone.js an application gets a no-op `NgZone` whose `onStable` and
`onMicrotaskEmpty` are plain `EventEmitter`s that nothing ever emits, and
whose `isStable` is always true — measured on core 22.2.3 and pinned in
ngtrue's own spec. Subscribing still works, nothing warns, and the work
queued behind the subscription silently never runs. A library written when
every application had zone.js, which waited for the zone to settle before it
measured, positioned or emitted, breaks for every consumer who takes the
default, and its own tests — usually zone.js tests — stay green.

Other people found this before it was written here.
[angular/components#28456](https://github.com/angular/components/issues/28456):
an overlay from `cdk/overlay` was created and never positioned or shown in a
zoneless application, because positioning waited for `onStable`.
[IgniteUI/igniteui-angular#17328](https://github.com/IgniteUI/igniteui-angular/pull/17328)
fixed grid virtualization, autosizing and keyboard navigation, which had
relied on `onStable` and silently never ran, closing six issues.
[SAP/fundamental-ngx#14435](https://github.com/SAP/fundamental-ngx/issues/14435):
the platform table's public `tableRowsSet` output never fired and infinite
scrolling stalled, both behind `onMicrotaskEmpty.pipe(take(1))`.
[atinc/ngx-tethys#3676](https://github.com/atinc/ngx-tethys/pull/3676) moved
its components from `onStable` to `afterNextRender` for the same reason.

## How it answers

Before the factory runs, it wraps `subscribe` on the two emitters of the
TestBed's `NgZone` and records a stack for every call — so a subscription
counts whether it came straight from the component, through `pipe`,
`asObservable()` or `firstValueFrom`, or from a dependency the component
called, and whether or not it was unsubscribed again before the end. Then the
fixture renders, `act` runs, the fixture renders again, and the wrappers come
off. Any subscription at all is a wait: in the zone a zoneless application
runs, nothing will ever answer it.

Dynamic rather than a scan of the source, because a scan cannot tell a wait
from a guarded one. `zone.isStable ? run() : zone.onStable.subscribe(run)` is
correct in both kinds of application and mentions `onStable` all the same;
here it simply never subscribes, because the no-op zone is always stable.
Reading `isStable` is not a wait and is not reported.

A subscription already in place when the assertion starts is reported too,
with no frame to name: it was made while the TestBed was being set up — by an
environment initializer, or by a service the injector created eagerly — or by
an earlier test on a TestBed nobody reset. Angular itself subscribes to
neither event in a zoneless TestBed, so whatever did is not Angular.

The frame is the first one outside `node_modules`, which is the line in the
library's own source, or the line that called the dependency that subscribed.
A test build that bundles its dependencies and leaves stacks unmapped has no
`node_modules` in any frame, and the frame named is then the first one after
the subscription — possibly inside rxjs. The event is right either way.

## It needs the zone of a zoneless application

TestBed provides the no-op zone unless a test asks for zone.js, and this
refuses a TestBed that did — `provideZoneChangeDetection()`, or anything else
that makes the zone an `NgZone`. Under zone.js both events fire and waiting
for them is legitimate, and the guarded shape above subscribes there and not
in a zoneless application, so a run under zone.js answers a question about a
different application. A zone that is not an `NgZone` and reports `isStable`
as false is refused for the second reason.

Code that branches on the zone.js global itself — `typeof Zone` — takes the
branch the test runner gives it. Run this where zone.js is not loaded to see
what a default zoneless application sees.

## It takes a factory, and only a factory

The subscriptions it looks for are made while the component is created and
first rendered, so a finished fixture has already made them, unseen. The
TestBed is set up before the factory runs — the zone has to exist before it
can be watched — so `TestBed.override…` calls belong before the assertion,
not inside the factory.

## What it does not check, and why

**Only the paths it was shown.** The render and `act` are the whole of what
runs, and each render waits for what Angular counts as pending — a
`resource` loading — and for nothing else. A subscription made once a bare
timer or promise settles after the last render, from a route nobody
navigated to, or from a branch the fixture's inputs never select, is not
seen. That is the same reach as a component's own tests, and no more.

**Not `onError` and not `onUnstable`.** The no-op zone never emits those
either, but Angular subscribes to both on its own behalf in a zoneless
TestBed: every `ComponentFixture` subscribes to `onError` as it is created,
and the change detection scheduler to `onUnstable`. Telling a library's
subscription from Angular's would mean reading stack frames, which a bundled
test build does not keep, so a run there would report Angular itself on
every fixture. Nor has a library been found waiting on either: none of 67
published Angular libraries, CDK and Material among them, refers to them.
Angular's subscriptions are pinned in ngtrue's own spec, so this paragraph
goes when they do.

**Not the zone APIs that already fail loudly.** A bare reference to the
zone.js global `Zone` throws a `ReferenceError` without zone.js, and
`NgZone.assertInAngularZone()` throws NG0909; neither needs a check to be
noticed. `NgZone.isInAngularZone()` and `NgZone.assertNotInAngularZone()` are
safe without zone.js.

**Not whether the work itself is right.** Moving a wait to `afterNextRender`
passes this; whether the overlay then lands in the right place is the
component's own spec's business.

The fixture is left as the run left it, with whatever subscriptions were made
still in place; they are harmless, since nothing will ever emit them.

## Type Parameters

### T

`T`

## Parameters

### create

() => `ComponentFixture`\<`T`\>

### options?

[`ZoneEventWaitOptions`](../interfaces/ZoneEventWaitOptions.md)\<`T`\> = `{}`

## Returns

`Promise`\<`void`\>

## Throws

naming every wait it saw, by event and by the
  frame that subscribed.

## Since

0.3.0
