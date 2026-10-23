import { NgZone } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

/**
 * One subscription {@link assertNoZoneEventWaits} saw.
 *
 * @since 0.3.0
 */
export interface ZoneEventWait {
  /** The `NgZone` event that was subscribed to. */
  readonly event: 'onStable' | 'onMicrotaskEmpty';

  /**
   * The stack frame that subscribed: the first one outside `node_modules`, so
   * the line in the library's own code, or the line that called the dependency
   * that did. `undefined` when the subscription was already in place before the
   * fixture was created, which leaves no stack of it to read.
   */
  readonly at: string | undefined;
}

/**
 * Thrown by {@link assertNoZoneEventWaits}, carrying every wait it saw.
 *
 * @since 0.3.0
 */
export class ZoneEventWaitError extends Error {
  readonly rule = 'zone-event-wait' as const;
  readonly waits: readonly ZoneEventWait[];

  constructor(waits: readonly ZoneEventWait[]) {
    super(
      'ngtrue: something this fixture ran waits for an NgZone event a zoneless app never emits.\n\n' +
        'rule: zone-event-wait\n\n' +
        `${describeWaits(waits)}\n\n` +
        'Zoneless change detection is the default for new applications since Angular 21, and an\n' +
        'application without zone.js runs a no-op NgZone: `onStable` and `onMicrotaskEmpty` are\n' +
        'plain emitters that nothing ever emits, and `isStable` is always true. Nothing warns. The\n' +
        'subscription succeeds and whatever waits behind it never runs — an overlay that never\n' +
        'attaches, a grid that never measures, an output that never fires.\n\n' +
        'Do the work after rendering instead: `afterNextRender` once, `afterEveryRender` every time.\n' +
        'Both run under zone.js as well, so they replace the subscription for every consumer. Where\n' +
        'the code really needs zone stability, read `isStable` first — it is true at once without\n' +
        'zone.js — and subscribe only when it is false.\n',
    );
    this.name = 'ZoneEventWaitError';
    this.waits = waits;
  }
}

/**
 * Options for {@link assertNoZoneEventWaits}.
 *
 * @since 0.3.0
 */
export interface ZoneEventWaitOptions<T = unknown> {
  /**
   * What to do with the fixture once it has rendered, so the subscriptions an
   * interaction makes are seen as well: open the overlay, hover the trigger,
   * scroll the list. It may return a promise, which is awaited, and the fixture
   * renders once more afterwards.
   *
   * Only the paths the render and this callback reach are watched. A tooltip
   * that subscribes when it opens passes a run that never opens it.
   */
  readonly act?: (fixture: ComponentFixture<T>) => unknown;
}

/**
 * Assert that nothing a fixture renders, or does when it is used, subscribes to
 * `NgZone.onStable` or `NgZone.onMicrotaskEmpty` — the two events a zoneless
 * application never emits.
 *
 * Give it a factory, and an `act` for the paths a render does not reach:
 *
 * ```ts
 * it('waits for nothing a zoneless app never emits', async () => {
 *   await assertNoZoneEventWaits(() => TestBed.createComponent(MyTooltip), {
 *     act: fixture => fixture.nativeElement.dispatchEvent(new MouseEvent('mouseenter')),
 *   });
 * });
 * ```
 *
 * ## The defect
 *
 * Zoneless change detection is the default for new applications since Angular
 * 21. Without zone.js an application gets a no-op `NgZone` whose `onStable` and
 * `onMicrotaskEmpty` are plain `EventEmitter`s that nothing ever emits, and
 * whose `isStable` is always true — measured on core 22.2.3 and pinned in
 * ngtrue's own spec. Subscribing still works, nothing warns, and the work
 * queued behind the subscription silently never runs. A library written when
 * every application had zone.js, which waited for the zone to settle before it
 * measured, positioned or emitted, breaks for every consumer who takes the
 * default, and its own tests — usually zone.js tests — stay green.
 *
 * Other people found this before it was written here.
 * [angular/components#28456](https://github.com/angular/components/issues/28456):
 * an overlay from `cdk/overlay` was created and never positioned or shown in a
 * zoneless application, because positioning waited for `onStable`.
 * [IgniteUI/igniteui-angular#17328](https://github.com/IgniteUI/igniteui-angular/pull/17328)
 * fixed grid virtualization, autosizing and keyboard navigation, which had
 * relied on `onStable` and silently never ran, closing six issues.
 * [SAP/fundamental-ngx#14435](https://github.com/SAP/fundamental-ngx/issues/14435):
 * the platform table's public `tableRowsSet` output never fired and infinite
 * scrolling stalled, both behind `onMicrotaskEmpty.pipe(take(1))`.
 * [atinc/ngx-tethys#3676](https://github.com/atinc/ngx-tethys/pull/3676) moved
 * its components from `onStable` to `afterNextRender` for the same reason.
 *
 * ## How it answers
 *
 * Before the factory runs, it wraps `subscribe` on the two emitters of the
 * TestBed's `NgZone` and records a stack for every call — so a subscription
 * counts whether it came straight from the component, through `pipe`,
 * `asObservable()` or `firstValueFrom`, or from a dependency the component
 * called, and whether or not it was unsubscribed again before the end. Then the
 * fixture renders, `act` runs, the fixture renders again, and the wrappers come
 * off. Any subscription at all is a wait: in the zone a zoneless application
 * runs, nothing will ever answer it.
 *
 * Dynamic rather than a scan of the source, because a scan cannot tell a wait
 * from a guarded one. `zone.isStable ? run() : zone.onStable.subscribe(run)` is
 * correct in both kinds of application and mentions `onStable` all the same;
 * here it simply never subscribes, because the no-op zone is always stable.
 * Reading `isStable` is not a wait and is not reported.
 *
 * A subscription already in place when the assertion starts is reported too,
 * with no frame to name: it was made while the TestBed was being set up — by an
 * environment initializer, or by a service the injector created eagerly — or by
 * an earlier test on a TestBed nobody reset. Angular itself subscribes to
 * neither event in a zoneless TestBed, so whatever did is not Angular.
 *
 * The frame is the first one outside `node_modules`, which is the line in the
 * library's own source, or the line that called the dependency that subscribed.
 * A test build that bundles its dependencies and leaves stacks unmapped has no
 * `node_modules` in any frame, and the frame named is then the first one after
 * the subscription — possibly inside rxjs. The event is right either way.
 *
 * ## It needs the zone of a zoneless application
 *
 * TestBed provides the no-op zone unless a test asks for zone.js, and this
 * refuses a TestBed that did — `provideZoneChangeDetection()`, or anything else
 * that makes the zone an `NgZone`. Under zone.js both events fire and waiting
 * for them is legitimate, and the guarded shape above subscribes there and not
 * in a zoneless application, so a run under zone.js answers a question about a
 * different application. A zone that is not an `NgZone` and reports `isStable`
 * as false is refused for the second reason.
 *
 * Code that branches on the zone.js global itself — `typeof Zone` — takes the
 * branch the test runner gives it. Run this where zone.js is not loaded to see
 * what a default zoneless application sees.
 *
 * ## It takes a factory, and only a factory
 *
 * The subscriptions it looks for are made while the component is created and
 * first rendered, so a finished fixture has already made them, unseen. The
 * TestBed is set up before the factory runs — the zone has to exist before it
 * can be watched — so `TestBed.override…` calls belong before the assertion,
 * not inside the factory.
 *
 * ## What it does not check, and why
 *
 * **Only the paths it was shown.** The render and `act` are the whole of what
 * runs, and each render waits for what Angular counts as pending — a
 * `resource` loading — and for nothing else. A subscription made once a bare
 * timer or promise settles after the last render, from a route nobody
 * navigated to, or from a branch the fixture's inputs never select, is not
 * seen. That is the same reach as a component's own tests, and no more.
 *
 * **Not `onError` and not `onUnstable`.** The no-op zone never emits those
 * either, but Angular subscribes to both on its own behalf in a zoneless
 * TestBed: every `ComponentFixture` subscribes to `onError` as it is created,
 * and the change detection scheduler to `onUnstable`. Telling a library's
 * subscription from Angular's would mean reading stack frames, which a bundled
 * test build does not keep, so a run there would report Angular itself on
 * every fixture. Nor has a library been found waiting on either: none of 67
 * published Angular libraries, CDK and Material among them, refers to them.
 * Angular's subscriptions are pinned in ngtrue's own spec, so this paragraph
 * goes when they do.
 *
 * **Not the zone APIs that already fail loudly.** A bare reference to the
 * zone.js global `Zone` throws a `ReferenceError` without zone.js, and
 * `NgZone.assertInAngularZone()` throws NG0909; neither needs a check to be
 * noticed. `NgZone.isInAngularZone()` and `NgZone.assertNotInAngularZone()` are
 * safe without zone.js.
 *
 * **Not whether the work itself is right.** Moving a wait to `afterNextRender`
 * passes this; whether the overlay then lands in the right place is the
 * component's own spec's business.
 *
 * The fixture is left as the run left it, with whatever subscriptions were made
 * still in place; they are harmless, since nothing will ever emit them.
 *
 * @throws {ZoneEventWaitError} naming every wait it saw, by event and by the
 *   frame that subscribed.
 *
 * @since 0.3.0
 */
export async function assertNoZoneEventWaits<T>(
  create: () => ComponentFixture<T>,
  options: ZoneEventWaitOptions<T> = {},
): Promise<void> {
  if (typeof create !== 'function') {
    throw new Error(
      'ngtrue: assertNoZoneEventWaits takes a factory — `() => TestBed.createComponent(Host)` — and\n' +
        'not a fixture.\n\n' +
        'The subscriptions it looks for are made while the component is created and first\n' +
        'rendered, so a finished fixture has already made them where nothing was watching, and a\n' +
        'pass would mean only that the component waits for nothing after its first render.',
    );
  }

  const zone = zoneOf(TestBed.inject(NgZone));

  // Already observed means subscribed while the TestBed was set up, before any
  // wrapper could see it. In a zoneless TestBed Angular subscribes to neither
  // event, so whoever did is not Angular.
  const waits: ZoneEventWait[] = WATCHED.filter(event => zone[event].observed).map(event => ({
    event,
    at: undefined,
  }));

  const unwatch = WATCHED.map(event => watch(zone[event], event, waits));
  try {
    const fixture = create();
    await render(fixture);
    if (options.act !== undefined) {
      await options.act(fixture);
      await render(fixture);
    }
  } finally {
    for (const undo of unwatch) undo();
  }

  if (waits.length > 0) throw new ZoneEventWaitError(waits);
}

const WATCHED = ['onStable', 'onMicrotaskEmpty'] as const;
type WatchedEvent = (typeof WATCHED)[number];

/** The part of an emitter this reads: rxjs's `observed`, and the method it wraps. */
interface Watchable {
  subscribe: (...args: never[]) => unknown;
  readonly observed: boolean;
}

/** The zone as this reads it, which is all a no-op zone has to offer. */
interface WatchableZone {
  readonly isStable: unknown;
  readonly onStable: Watchable;
  readonly onMicrotaskEmpty: Watchable;
}

/**
 * The TestBed's zone, refused unless it is the one a zoneless application runs.
 *
 * `instanceof NgZone` rather than a check for Angular's no-op zone class,
 * because that class is private and the public one is the one that matters: the
 * no-op zone does not extend `NgZone`, and everything that does needs zone.js
 * to construct.
 */
function zoneOf(zone: NgZone): WatchableZone {
  if (zone instanceof NgZone) {
    throw new Error(
      'ngtrue: this TestBed runs zone.js change detection, and assertNoZoneEventWaits answers for a\n' +
        'zoneless application.\n\n' +
        'Under zone.js `onStable` and `onMicrotaskEmpty` do fire, so waiting for them is legitimate\n' +
        'there — and the paths differ: code guarded with `isStable` subscribes under zone.js and\n' +
        'never does without it. A subscription found here would say nothing about the application\n' +
        'this check is for, and finding none would say less.\n\n' +
        'Remove `provideZoneChangeDetection()`, or whatever else provides NgZone, from this test:\n' +
        'TestBed runs the no-op zone of a zoneless application unless a test asks otherwise.',
    );
  }

  const candidate = zone as unknown as Partial<Record<WatchedEvent, Partial<Watchable> | undefined>>;
  for (const event of WATCHED) {
    if (typeof candidate[event]?.subscribe !== 'function') {
      throw new Error(
        `ngtrue: the NgZone in this TestBed has no \`${event}\` emitter to watch, so it is neither\n` +
          "Angular's NgZone nor the no-op zone a zoneless application runs, and a run against it\n" +
          'would say nothing about either. Remove whatever provides NgZone in this test.',
      );
    }
  }

  const watchable = zone as unknown as WatchableZone;
  if (watchable.isStable !== true) {
    throw new Error(
      'ngtrue: the NgZone in this TestBed reports `isStable` as false, which the no-op zone of a\n' +
        'zoneless application never does.\n\n' +
        'Code guarded with `isStable` — the correct way to wait for a zone that might be there —\n' +
        "would take its waiting path here and be reported for the fixture's zone rather than its\n" +
        'own. Remove whatever provides NgZone in this test.',
    );
  }
  return watchable;
}

/**
 * Record every subscription to one emitter, with the stack that made it, and
 * return what puts the emitter back.
 *
 * The wrapper goes on the instance, so nothing outside this TestBed's zone is
 * touched, and the call goes through untouched: the component behaves exactly
 * as it would in a zoneless application, where its wait is accepted and never
 * answered. Putting the emitter back restores whatever `subscribe` it had of its
 * own, rather than assuming it had none.
 */
function watch(emitter: Watchable, event: WatchedEvent, waits: ZoneEventWait[]): () => void {
  const own = Object.getOwnPropertyDescriptor(emitter, 'subscribe');
  const original = emitter.subscribe;

  emitter.subscribe = function (this: unknown, ...args: never[]): unknown {
    waits.push({ event, at: subscriberOf(deepStack()) });
    return original.apply(this, args);
  };

  return () => {
    if (own === undefined) Reflect.deleteProperty(emitter, 'subscribe');
    else Object.defineProperty(emitter, 'subscribe', own);
  };
}

/**
 * A stack deep enough to get past rxjs.
 *
 * V8 keeps ten frames by default, and a subscription through
 * `asObservable().pipe(take(1), takeUntil(…))` spends more than that inside
 * rxjs before it reaches the line that asked for it — so at the default the
 * frame worth naming is cut off. The limit is raised for this one capture and
 * put back. Runtimes without the property keep their own limit, which is
 * deeper.
 */
function deepStack(): string | undefined {
  const constructor = Error as { stackTraceLimit?: unknown };
  const limit = constructor.stackTraceLimit;
  if (typeof limit === 'number') constructor.stackTraceLimit = Math.max(limit, 64);
  try {
    // Read here, while the frames are this call's: the getter formats lazily.
    return new Error().stack;
  } finally {
    if (typeof limit === 'number') constructor.stackTraceLimit = limit;
  }
}

/** A line of a stack that names a position, in V8's format or Firefox's and Safari's. */
const FRAME = /:\d+:\d+\)?$/;
const IN_NODE_MODULES = /[\\/]node_modules[\\/]/;
// Installed, or pre-bundled by vite: `.vite/deps/@angular_core.js`, `rxjs.js`.
const IN_ANGULAR_OR_RXJS = /[\\/]node_modules[\\/](?:\.vite[\\/]deps[\\/])?(?:@angular[\\/_]|rxjs\b)/;

/**
 * The frame that subscribed, below the two that are this module's own — the
 * capture and the wrapper: the first outside `node_modules`, failing that the
 * first outside Angular and rxjs, and failing that the first there is. Measured
 * at V8's default depth, every frame left is inside rxjs or Angular, which is
 * what {@link deepStack} is for.
 */
function subscriberOf(stack: string | undefined): string {
  const frames = (stack ?? '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => FRAME.test(line))
    .map(line => line.replace(/^at /, ''))
    .slice(2);
  return (
    frames.find(frame => !IN_NODE_MODULES.test(frame)) ??
    frames.find(frame => !IN_ANGULAR_OR_RXJS.test(frame)) ??
    frames[0] ??
    '(the runtime recorded no stack)'
  );
}

async function render<T>(fixture: ComponentFixture<T>): Promise<void> {
  // Both, in this order. `detectChanges()` renders now rather than in the
  // macrotask zoneless change detection would wait for, and runs the
  // `afterNextRender` work a migrated component does instead of subscribing.
  // `whenStable()` then waits out what Angular still counts as pending — a
  // `resource` loading, and the render its result schedules — so a wait behind
  // content that arrives later is seen too. A bare timer or promise is not
  // pending to Angular, and is not waited for.
  fixture.detectChanges();
  await fixture.whenStable();
}

/** One line per distinct wait, counted, in the order they were made. */
function describeWaits(waits: readonly ZoneEventWait[]): string {
  const counted = new Map<string, { wait: ZoneEventWait; count: number }>();
  for (const wait of waits) {
    const key = `${wait.event}\n${wait.at ?? ''}`;
    const seen = counted.get(key);
    if (seen === undefined) counted.set(key, { wait, count: 1 });
    else seen.count++;
  }
  return [...counted.values()]
    .map(({ wait, count }) => {
      const times = count === 1 ? '' : ` ${String(count)} times`;
      return wait.at === undefined
        ? `- \`${wait.event}\`, subscribed${times} before the fixture was created, so no frame names who:\n` +
            '  while the TestBed was set up — an environment initializer, or a service the injector\n' +
            '  created eagerly — or by an earlier test on a TestBed nobody reset.'
        : `- \`${wait.event}\`, subscribed${times} at ${wait.at}`;
    })
    .join('\n');
}
