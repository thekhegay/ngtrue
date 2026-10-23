/**
 * Components whose global-attribute inputs DO leak onto their host, one route
 * per class, plus the bases and host directives the check cannot see through
 * and must say so.
 */
import { Component, Directive, input } from '@angular/core';
import { FixtureCdkDisableable, FixtureCdkHasTooltip, FixtureCdkHeading } from '@fixture/cdk';
import { FixtureControl } from '@fixture/declarations-broken/core';
import { FixtureFullHeading } from '@fixture/full';
import { FixtureCdkTooltip } from '@fixture/missing';
import { FixtureCdkScrollable } from '@fixture/missing/scrolling';

import { FixtureCollapsible } from './collapsible.js';
import { FixtureHasTooltip, FixtureTooltipped } from './tooltip.js';

/** A `title` input and nothing on the host: the shape of ngwr's three result presets. */
@Component({ selector: 'fixture-result', template: '<h2>{{ title() }}</h2>' })
export class FixtureResult {
  readonly title = input('404');
}

/** A camelCase public name. `tabIndex="0"`, written statically, lands on the host as `tabindex`. */
@Component({ selector: 'fixture-field', template: '<input [tabIndex]="tabIndex()" />' })
export class FixtureField {
  readonly tabIndex = input(0);
}

/** A STATIC host attribute is not a fix: a template's own attributes win over a host's. */
@Component({ selector: 'fixture-note', template: '<p>{{ title() }}</p>', host: { title: '' } })
export class FixtureNote {
  readonly title = input('');
}

/** A plain class between a component and its base, which Angular's inheritance walks straight through. */
export abstract class FixtureChoice extends FixtureControl {}

/** Inherits `id` from the other entry point, through `FixtureChoice`: the leak is this component's. */
@Component({ selector: 'fixture-radio', template: '<input type="radio" [id]="id()" />' })
export class FixtureRadio extends FixtureChoice {}

/** A field decorator in the standard form, the kind ng-zorro-antd's `@WithConfig()` is. It does nothing. */
function configurable(_value: undefined, _context: ClassFieldDecoratorContext): void {}

/**
 * FixtureRadio's leak in a class TypeScript wraps in a function for its
 * decorated field, holding the base in a local the module scope does not have.
 */
@Component({ selector: 'fixture-toggle', template: '<input type="checkbox" [id]="id()" />' })
export class FixtureToggle extends FixtureControl {
  @configurable size = 'medium';
}

/** A mixin, as a pre-signals library might write one: the base is a call, not a class. */
export function withSize<T extends abstract new (...args: never[]) => object>(base: T): T {
  return base;
}

/** Extends what `withSize` returns, which no reading of the package can follow to a class. */
@Component({ selector: 'fixture-sized', template: '<ng-content />' })
export class FixtureSized extends withSize(FixtureControl) {}

/** Exposes a host directive's input as `hidden`, and nothing binds it. */
@Component({
  selector: 'fixture-section',
  template: '<ng-content />',
  hostDirectives: [{ directive: FixtureCollapsible, inputs: ['collapsed: hidden'] }],
})
export class FixtureSection {}

/**
 * Exposes a host directive from a package that is NOT installed as `title`.
 * The alias is visible here; the directive's host bindings are not.
 */
@Component({
  selector: 'fixture-badge',
  template: '<ng-content />',
  hostDirectives: [{ directive: FixtureCdkTooltip, inputs: ['text: title'] }],
})
export class FixtureBadge {}

/**
 * Exposes nothing itself. Its host directive exposes `title` from a host
 * directive of its own, and Angular applies that one to this host as well.
 */
@Component({ selector: 'fixture-icon-button', template: '<ng-content />', hostDirectives: [FixtureHasTooltip] })
export class FixtureIconButton {}

/** Inherits a base's host directive, and with it the `title` the base exposes. */
@Component({ selector: 'fixture-link', template: '<ng-content />' })
export class FixtureLink extends FixtureTooltipped {}

/**
 * A host directive from a package that is NOT installed, exposing nothing here.
 * Its own host directives would land on this host under names only its package
 * declares, and there is no package to read them from.
 */
@Component({ selector: 'fixture-chip', template: '<ng-content />', hostDirectives: [FixtureCdkScrollable] })
export class FixtureChip {}

/** A directive on a custom element leaks exactly as a component does. */
@Directive({ selector: 'fixture-tab' })
export class FixtureTab {
  readonly title = input('');
}

/**
 * Extends a class from a package that is NOT installed. Every input of its base
 * is this component's and none can be read — while its own `title` still can.
 */
@Component({ selector: 'fixture-styled', template: '<ng-content />' })
export class FixtureStyled extends FixtureCdkScrollable {
  readonly title = input('');
}

/** Inherits `title` from a base in an INSTALLED dependency, and nothing binds it: the leak is this component's. */
@Component({ selector: 'fixture-headline', template: '<h2>{{ title() }}</h2>' })
export class FixtureHeadline extends FixtureCdkHeading {}

/** Extends a mixin call an installed dependency exports, which no reading of that package can follow to a class. */
@Component({ selector: 'fixture-legacy', template: '<ng-content />' })
export class FixtureLegacy extends FixtureCdkDisableable {}

/**
 * FixtureHeadline's leak, from a dependency compiled in full mode: the base is
 * a class with a definition the check cannot read, not a plain class it may
 * walk through.
 */
@Component({ selector: 'fixture-banner', template: '<h2>{{ title() }}</h2>' })
export class FixtureBanner extends FixtureFullHeading {}

/**
 * Carries a host directive from an installed dependency that applies one of its
 * own and exposes it as `title`, a name only that package declares.
 */
@Component({ selector: 'fixture-help', template: '<ng-content />', hostDirectives: [FixtureCdkHasTooltip] })
export class FixtureHelp {}
