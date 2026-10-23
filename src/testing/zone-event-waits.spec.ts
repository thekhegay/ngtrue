import {
  Component,
  EventEmitter,
  inject,
  NgZone,
  provideEnvironmentInitializer,
  resource,
  signal,
  type Type,
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { AttachesOnHover, GuardedByIsStable, RepositionsAfterRender, WaitsForZone } from './fixtures/zone-waits.js';
import { assertNoZoneEventWaits, ZoneEventWaitError } from './zone-event-waits.js';

/**
 * The check proving itself.
 *
 * Every reported case asserts the rule, the event and the frame rather than
 * that something threw, and every refusal asserts that it was a refusal and not
 * a finding — a check that failed for the wrong reason would pass
 * `rejects.toThrow()` and go on misreporting for everyone who used it.
 */

/**
 * The error the assertion threw. Throws when it did NOT throw, because
 * `await promise.catch(e => e)` yields `undefined` on a pass and every
 * expectation after it would then fail with a message about `undefined`.
 */
async function errorFrom(run: Promise<void>): Promise<ZoneEventWaitError> {
  try {
    await run;
  } catch (error) {
    if (error instanceof ZoneEventWaitError) return error;
    throw error;
  }
  throw new Error('expected assertNoZoneEventWaits to report a wait, and it passed.');
}

/** The refusal the assertion threw, which must not be a finding dressed up as one. */
async function refusalFrom(run: Promise<void>): Promise<Error> {
  try {
    await run;
  } catch (error) {
    if (error instanceof ZoneEventWaitError) {
      throw new Error('expected a refusal, and assertNoZoneEventWaits reported a wait.', { cause: error });
    }
    if (error instanceof Error) return error;
    throw error;
  }
  throw new Error('expected assertNoZoneEventWaits to refuse, and it passed.');
}

/** Rendered, settled, and given a macrotask on top, so "never" means more than "not yet". */
async function settled<T>(type: Type<T>): Promise<T> {
  const fixture = TestBed.createComponent(type);
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise(resolve => setTimeout(resolve, 10));
  return fixture.componentInstance;
}

function hover(fixture: ComponentFixture<unknown>): void {
  (fixture.nativeElement as HTMLElement).dispatchEvent(new MouseEvent('mouseenter'));
}

describe('assertNoZoneEventWaits', () => {
  describe("Angular's zoneless zone, which the rule rests on", () => {
    // Each claim the JSDoc makes about the zone a zoneless application runs,
    // held against the Angular installed. Should a release change any of them,
    // these fail first and say which paragraph has to go.

    it('is not an NgZone, and is always stable, in a TestBed nobody configured', () => {
      const zone = TestBed.inject(NgZone);
      expect(zone instanceof NgZone).toBe(false);
      expect(zone.isStable).toBe(true);
    });

    it('never runs the work behind a wait, and runs it behind the guarded and the migrated shapes', async () => {
      // What makes the pair below honest: the component reported really is
      // broken, and the two that pass really do their work.
      expect((await settled(WaitsForZone)).repositioned).toBe(false);
      expect((await settled(GuardedByIsStable)).repositioned).toBe(true);
      expect((await settled(RepositionsAfterRender)).repositioned).toBe(true);
    });

    it('subscribes to onError and onUnstable on its own behalf, and to neither watched event', async () => {
      // Why `onError` and `onUnstable` are not watched: Angular is already
      // there. When this fails because Angular stopped, the JSDoc paragraph on
      // the two events goes, and they can join the watched ones.
      const zone = TestBed.inject(NgZone);
      expect(zone.onError.observed).toBe(false);

      await settled(RepositionsAfterRender);

      expect(zone.onError.observed).toBe(true);
      expect(zone.onUnstable.observed).toBe(true);
      expect(zone.onStable.observed).toBe(false);
      expect(zone.onMicrotaskEmpty.observed).toBe(false);
    });
  });

  describe('the pair it is held to', () => {
    it('reports a component that waits for onMicrotaskEmpty, naming the event and the line', async () => {
      const error = await errorFrom(assertNoZoneEventWaits(() => TestBed.createComponent(WaitsForZone)));

      expect(error.rule).toBe('zone-event-wait');
      expect(error.waits.map(wait => wait.event)).toEqual(['onMicrotaskEmpty']);
      // Through `asObservable().pipe(take(1), takeUntil(…))`, which spends more
      // frames inside rxjs than V8 keeps by default: the frame is the
      // component's, not rxjs's.
      expect(error.waits[0]?.at).toMatch(/^WaitsForZone\.ngAfterViewInit \(.*zone-waits\.ts:\d+:\d+\)$/);
      expect(error.message).toContain('rule: zone-event-wait');
      expect(error.message).toContain('default for new applications since Angular 21');
    });

    it('passes the same component guarded with isStable', async () => {
      await expect(assertNoZoneEventWaits(() => TestBed.createComponent(GuardedByIsStable))).resolves.toBeUndefined();
    });

    it('passes the same component moved to afterNextRender', async () => {
      await expect(
        assertNoZoneEventWaits(() => TestBed.createComponent(RepositionsAfterRender)),
      ).resolves.toBeUndefined();
    });
  });

  describe('act', () => {
    it('passes a component whose wait only an interaction reaches, when nothing interacts', async () => {
      // The limit the JSDoc states, pinned: render alone never opens the panel.
      await expect(assertNoZoneEventWaits(() => TestBed.createComponent(AttachesOnHover))).resolves.toBeUndefined();
    });

    it('reports the wait an interaction reaches', async () => {
      const error = await errorFrom(
        assertNoZoneEventWaits(() => TestBed.createComponent(AttachesOnHover), { act: hover }),
      );

      expect(error.waits.map(wait => wait.event)).toEqual(['onStable']);
      expect(error.waits[0]?.at).toMatch(/^AttachesOnHover\.open \(.*zone-waits\.ts:\d+:\d+\)$/);
    });

    it('awaits an asynchronous act before it looks', async () => {
      const error = await errorFrom(
        assertNoZoneEventWaits(() => TestBed.createComponent(AttachesOnHover), {
          act: async fixture => {
            await new Promise(resolve => setTimeout(resolve, 10));
            hover(fixture);
          },
        }),
      );

      expect(error.waits.map(wait => wait.event)).toEqual(['onStable']);
    });

    it('renders again after it, so a wait the interaction only schedules is seen', async () => {
      // A dropdown whose panel waits once it exists: the click writes a signal,
      // and the panel is created by the render that write schedules, after
      // `act` has returned.
      @Component({
        template: '<button (click)="open.set(true)">open</button> @if (open()) { <waits-for-zone /> }',
        imports: [WaitsForZone],
      })
      class Dropdown {
        readonly open = signal(false);
      }

      const error = await errorFrom(
        assertNoZoneEventWaits(() => TestBed.createComponent(Dropdown), {
          act: fixture => {
            (fixture.nativeElement as HTMLElement).querySelector('button')?.click();
          },
        }),
      );

      expect(error.waits.map(wait => wait.event)).toEqual(['onMicrotaskEmpty']);
    });
  });

  it('waits out what Angular counts as pending before it looks, so a wait behind loaded content is seen', async () => {
    // The rows arrive after the first render, through a resource Angular
    // tracks as pending; the panel that waits exists only once they have.
    @Component({
      template: '@if (rows.hasValue()) { <waits-for-zone /> }',
      imports: [WaitsForZone],
    })
    class Loaded {
      readonly rows = resource({
        loader: () => new Promise<readonly string[]>(resolve => setTimeout(() => resolve(['row']), 5)),
      });
    }

    const error = await errorFrom(assertNoZoneEventWaits(() => TestBed.createComponent(Loaded)));

    expect(error.waits.map(wait => wait.event)).toEqual(['onMicrotaskEmpty']);
  });

  it('reports every wait it saw, counted, not only the first', async () => {
    @Component({
      template: '<waits-for-zone /><waits-for-zone /><attaches-on-hover />',
      imports: [WaitsForZone, AttachesOnHover],
    })
    class Page {}

    const error = await errorFrom(
      assertNoZoneEventWaits(() => TestBed.createComponent(Page), {
        act: fixture => {
          (fixture.nativeElement as HTMLElement)
            .querySelector('attaches-on-hover')
            ?.dispatchEvent(new MouseEvent('mouseenter'));
        },
      }),
    );

    expect(error.waits.map(wait => wait.event)).toEqual(['onMicrotaskEmpty', 'onMicrotaskEmpty', 'onStable']);
    expect(error.message).toMatch(/`onMicrotaskEmpty`, subscribed 2 times at WaitsForZone\.ngAfterViewInit /);
    expect(error.message).toMatch(/`onStable`, subscribed at AttachesOnHover\.open /);
  });

  it('reports a subscription made while the TestBed was set up, with no frame to name', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideEnvironmentInitializer(() => {
          inject(NgZone).onStable.subscribe(() => undefined);
        }),
      ],
    });

    const error = await errorFrom(assertNoZoneEventWaits(() => TestBed.createComponent(RepositionsAfterRender)));

    expect(error.waits).toEqual([{ event: 'onStable', at: undefined }]);
    expect(error.message).toContain('before the fixture was created');
  });

  it('leaves the zone as it found it, whether the run passed, failed or threw', async () => {
    const zone = TestBed.inject(NgZone);
    const ownSubscribe = (): boolean =>
      Object.hasOwn(zone.onStable, 'subscribe') || Object.hasOwn(zone.onMicrotaskEmpty, 'subscribe');

    await assertNoZoneEventWaits(() => TestBed.createComponent(RepositionsAfterRender));
    expect(ownSubscribe()).toBe(false);

    await errorFrom(assertNoZoneEventWaits(() => TestBed.createComponent(WaitsForZone)));
    expect(ownSubscribe()).toBe(false);

    const thrown = await assertNoZoneEventWaits(() => {
      throw new Error('the factory broke');
    }).catch((error: unknown) => error);
    expect((thrown as Error).message).toBe('the factory broke');
    expect(ownSubscribe()).toBe(false);
  });

  describe('refusals', () => {
    it('refuses a zone.js NgZone before it creates anything', async () => {
      // zone.js is not installed here, and importing it would patch the
      // globals of every other spec in the run, so this zone is an NgZone in
      // name only. That is all the check reads before it refuses — and the
      // factory never running is the proof.
      TestBed.configureTestingModule({
        providers: [{ provide: NgZone, useValue: Object.create(NgZone.prototype) as NgZone }],
      });
      let created = false;

      const error = await refusalFrom(
        assertNoZoneEventWaits(() => {
          created = true;
          return TestBed.createComponent(RepositionsAfterRender);
        }),
      );

      expect(created).toBe(false);
      expect(error.message).toContain('this TestBed runs zone.js change detection');
      expect(error.message).toContain('provideZoneChangeDetection()');
    });

    it('refuses a zone that reports itself unstable, which would blame a guarded component', async () => {
      const unstable = {
        isStable: false,
        onStable: new EventEmitter(),
        onMicrotaskEmpty: new EventEmitter(),
        onUnstable: new EventEmitter(),
        onError: new EventEmitter(),
      };
      TestBed.configureTestingModule({ providers: [{ provide: NgZone, useValue: unstable }] });

      const error = await refusalFrom(assertNoZoneEventWaits(() => TestBed.createComponent(GuardedByIsStable)));

      expect(error.message).toContain('reports `isStable` as false');
    });

    it('refuses a stand-in zone with no emitter to watch', async () => {
      // The hand-rolled zone of an older spec: enough for TestBed, nothing to
      // wrap. Reading it would fail on `undefined` rather than say why.
      const handRolled = {
        isStable: true,
        onUnstable: new EventEmitter(),
        onError: new EventEmitter(),
        run: (fn: () => unknown) => fn(),
        runOutsideAngular: (fn: () => unknown) => fn(),
      };
      TestBed.configureTestingModule({ providers: [{ provide: NgZone, useValue: handRolled }] });

      const error = await refusalFrom(assertNoZoneEventWaits(() => TestBed.createComponent(RepositionsAfterRender)));

      expect(error.message).toContain('has no `onStable` emitter to watch');
    });

    it('refuses a finished fixture in place of a factory', async () => {
      const fixture = TestBed.createComponent(WaitsForZone);

      const error = await refusalFrom(
        assertNoZoneEventWaits(fixture as unknown as () => ComponentFixture<WaitsForZone>),
      );

      expect(error.message).toContain('takes a factory');
    });
  });
});
