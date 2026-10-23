/**
 * Components for `assertNoZoneEventWaits`'s own tests: one tooltip written
 * three ways, and an overlay that waits only once it is opened.
 *
 * Each is a shape a published library shipped. The tooltip that waits does what
 * fundamental-ngx's platform table did before its zoneless fix:
 * `onMicrotaskEmpty.pipe(take(1))` once the view has rendered. The guarded one
 * is how formly and ngx-tethys' flexible-text keep the wait for zone.js
 * applications without breaking zoneless ones, and the third is where the
 * migrations ended up. The overlay is `cdk/overlay`'s before
 * angular/components#28456: the wait sits behind an interaction, so a render
 * alone never reaches it.
 *
 * Compiled just-in-time, unlike `controls.ts`. Nothing here declares `input()`,
 * `model()` or `output()`, the initializer APIs JIT cannot see, and what the
 * assertion watches — a subscription made from a constructor, a lifecycle hook
 * or a listener — runs the same however the class was compiled.
 */
import { afterNextRender, Component, DestroyRef, inject, NgZone } from '@angular/core';
import { firstValueFrom, Subject, take, takeUntil } from 'rxjs';

/**
 * Repositions once the zone reports its microtask queue empty. In a zoneless
 * application that report never comes, so it never repositions — which the
 * spec checks, so the reported half of the pair is a real defect rather than a
 * pattern somebody disapproves of.
 */
@Component({ selector: 'waits-for-zone', template: '<span>tip</span>' })
export class WaitsForZone {
  readonly zone = inject(NgZone);
  readonly destroyed = new Subject<void>();
  repositioned = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.destroyed.next();
    });
  }

  ngAfterViewInit(): void {
    this.zone.onMicrotaskEmpty
      .asObservable()
      .pipe(take(1), takeUntil(this.destroyed))
      .subscribe(() => {
        this.repositioned = true;
      });
  }
}

/**
 * The same tooltip, waiting only when there is a zone to wait for. The no-op
 * zone is always stable, so without zone.js it never subscribes and repositions
 * at once — correct in both kinds of application, and `onStable` is right there
 * in the source, which is why the check is dynamic rather than a scan.
 */
@Component({ selector: 'guarded-by-is-stable', template: '<span>tip</span>' })
export class GuardedByIsStable {
  readonly zone = inject(NgZone);
  repositioned = false;

  ngAfterViewInit(): void {
    const stable = this.zone.isStable ? Promise.resolve() : firstValueFrom(this.zone.onStable);
    void stable.then(() => {
      this.repositioned = true;
    });
  }
}

/** The same tooltip after the migration: `afterNextRender` runs under either kind of change detection. */
@Component({ selector: 'repositions-after-render', template: '<span>tip</span>' })
export class RepositionsAfterRender {
  repositioned = false;

  constructor() {
    afterNextRender(() => {
      this.repositioned = true;
    });
  }
}

/** Attaches its panel once the zone settles after the trigger is hovered, and not before. */
@Component({
  selector: 'attaches-on-hover',
  template: '<span>trigger</span>',
  host: { '(mouseenter)': 'open()' },
})
export class AttachesOnHover {
  readonly zone = inject(NgZone);
  attached = false;

  open(): void {
    this.zone.onStable.pipe(take(1)).subscribe(() => {
      this.attached = true;
    });
  }
}
