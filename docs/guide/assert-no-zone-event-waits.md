# assertNoZoneEventWaits

`ngtrue/testing`

Assert that nothing a component renders, or does when it is used, subscribes to
`NgZone.onStable` or `NgZone.onMicrotaskEmpty` — the two events a zoneless
application never emits — and fail naming the event and the line that
subscribed.

## A runnable example

```ts
import { Component, inject, NgZone } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { assertNoZoneEventWaits } from 'ngtrue/testing';
import { take } from 'rxjs';

@Component({
  selector: 'my-tooltip',
  template: '<span>tip</span>',
  host: { '(mouseenter)': 'open()' },
})
export class MyTooltip {
  private readonly zone = inject(NgZone);

  open(): void {
    // Waits for a zone a zoneless application does not have.
    this.zone.onStable.pipe(take(1)).subscribe(() => this.position());
  }

  private position(): void {
    // measure the panel and place it
  }
}

describe('MyTooltip', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('waits for nothing a zoneless application never emits', async () => {
    await assertNoZoneEventWaits(() => TestBed.createComponent(MyTooltip), {
      act: fixture => fixture.nativeElement.dispatchEvent(new MouseEvent('mouseenter')),
    });
  });
});
```

That test fails:

```text
ngtrue: something this fixture ran waits for an NgZone event a zoneless app never emits.

rule: zone-event-wait

- `onStable`, subscribed at MyTooltip.open (…/my-tooltip.spec.ts:16:38)
```

followed by why, and what to do instead. Replace the subscription with
`afterNextRender(() => this.position(), { injector: this.injector })`, where
`injector = inject(Injector)` — `open()` runs outside an injection context —
and it passes.

Pass a **factory**, not a finished fixture. The subscriptions it looks for are
made while the component is created and first rendered, so they have to be
watched from before the factory runs. TestBed is set up before then, so any
`TestBed.override…` call belongs before the assertion rather than inside the
factory.

## The defect

Zoneless change detection is the default for new applications since Angular 21.
An application without zone.js gets a no-op `NgZone`: its `onStable` and
`onMicrotaskEmpty` are plain emitters that nothing ever emits, and its
`isStable` is always true. Subscribing still works and nothing warns, so the
work queued behind the subscription silently never runs — an overlay that
never positions, a grid that never measures, an output that never fires.

It has happened to libraries other people depend on:

- [angular/components#28456](https://github.com/angular/components/issues/28456):
  an overlay from `cdk/overlay` was created and never positioned or shown,
  because positioning waited for `onStable`.
- [IgniteUI/igniteui-angular#17328](https://github.com/IgniteUI/igniteui-angular/pull/17328):
  grid virtualization, autosizing and keyboard navigation relied on `onStable`
  and silently never ran. The fix closed six issues.
- [SAP/fundamental-ngx#14435](https://github.com/SAP/fundamental-ngx/issues/14435):
  the platform table's public `tableRowsSet` output never fired and infinite
  scrolling stalled, both behind `onMicrotaskEmpty.pipe(take(1))`.
- [atinc/ngx-tethys#3676](https://github.com/atinc/ngx-tethys/pull/3676) moved
  its components from `onStable` to `afterNextRender` for the same reason.

A library's own tests rarely see it, because a library's own tests usually run
under zone.js, where both events fire.

## The fix

Do the work after rendering instead: `afterNextRender` once, `afterEveryRender`
every time. Both run under zone.js as well, so they replace the subscription for
every consumer.

Where code genuinely needs zone stability, read `isStable` first. It is true at
once without zone.js, so the zoneless path never subscribes, and this passes:

```ts
const stable = this.zone.isStable ? Promise.resolve() : firstValueFrom(this.zone.onStable);
```

## How it answers

Dynamically, because a scan of the source cannot tell a wait from that guarded
shape — both mention `onStable`.

Before the factory runs, it wraps `subscribe` on the two emitters of the
TestBed's zone and records a stack for every call. Then the fixture renders,
`act` runs, the fixture renders again, and the wrappers come off. Any
subscription at all is reported: in the zone a zoneless application runs,
nothing will ever answer it. It counts whether it came straight from the
component, through `pipe`, `asObservable()` or `firstValueFrom`, or from a
dependency the component called, and whether or not it was unsubscribed again.

Each wait carries the event and the frame that subscribed — the first one
outside `node_modules`, which is a line in your own source, or the line that
called the dependency that subscribed:

```ts
import { ZoneEventWaitError } from 'ngtrue/testing';

const hover = (fixture: ComponentFixture<MyTooltip>) =>
  fixture.nativeElement.dispatchEvent(new MouseEvent('mouseenter'));

const error = await assertNoZoneEventWaits(() => TestBed.createComponent(MyTooltip), { act: hover }).catch(e => e);
expect(error).toBeInstanceOf(ZoneEventWaitError);
expect((error as ZoneEventWaitError).waits.map(wait => wait.event)).toEqual(['onStable']);
```

A test build that bundles its dependencies and does not map stacks has no
`node_modules` in any frame, and the frame named is then simply the first after
the subscription, which can be inside rxjs. The event is right either way.

A subscription already in place when the assertion starts is reported too, with
no frame: something subscribed while the TestBed was set up — an environment
initializer, a service the injector created eagerly — or an earlier test left it
on a TestBed nobody reset. Angular itself subscribes to neither event in a
zoneless TestBed.

## `act`

Only the paths a run reaches are watched, and a render reaches only the paths a
render takes. A tooltip that waits when it opens passes a run that never opens
it, which is why `act` exists: hover the trigger, open the panel, scroll the
list. It gets the fixture, may return a promise, which is awaited, and the
fixture renders once more after it.

## It needs a zoneless TestBed

TestBed runs the no-op zone unless a test asks for zone.js, and this refuses a
TestBed that did — `provideZoneChangeDetection()`, or anything else that makes
the zone an `NgZone`. Under zone.js both events fire and waiting for them is
legitimate, and the guarded shape above subscribes there and not without it, so
a run under zone.js answers a question about a different application. A stand-in
zone that reports `isStable` as false is refused for the same reason.

Code that branches on the zone.js global itself — `typeof Zone` — takes the
branch the test runner gives it. Run this where zone.js is not loaded to see
what a default zoneless application sees.

## What it does not check

**Only the paths it was shown.** Each render waits for what Angular counts as
pending, such as a `resource` loading, and for nothing else. A subscription made
once a bare timer or promise settles after the last render, from a route nobody
navigated to, or from a branch the fixture never selects, is not seen. That is
the reach of a component's own tests, and no more.

**Not `onError`, and not `onUnstable`.** The no-op zone never emits those either,
but Angular subscribes to both itself in a zoneless TestBed: every
`ComponentFixture` subscribes to `onError` as it is created, and the change
detection scheduler to `onUnstable`. Telling a library's subscription from
Angular's would mean reading stack frames, which a bundled test build does not
keep, so a check that watched them would report Angular on every fixture. No
library has been found waiting on either.

**Not the zone APIs that fail loudly anyway.** A bare reference to the zone.js
global `Zone` throws without zone.js, and `NgZone.assertInAngularZone()` throws
NG0909. `NgZone.isInAngularZone()` and `NgZone.assertNotInAngularZone()` are safe
without it.

**Not whether the replacement is right.** Moving a wait to `afterNextRender`
passes; whether the overlay then lands in the right place is the component's
own spec's business.

The fixture is left as the run left it, subscriptions included. They are
harmless: nothing will ever emit them.
