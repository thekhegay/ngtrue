/**
 * Components whose global-attribute inputs never leak onto their host, each by
 * a different route `globalAttributeInputs` has to follow to see it.
 */
import { Component, input } from '@angular/core';
import { FixtureLabelled } from 'fixture-declarations-sound/core';

import { FixtureTipped, FixtureTitled } from './titled.js';

/** A `title` input with the host attribute bound away — the fix ngwr applied to ten components. */
@Component({
  selector: 'fixture-card',
  template: '<h2>{{ title() }}</h2>',
  host: { '[attr.title]': 'null' },
})
export class FixtureCard {
  readonly title = input('');
}

/** The property is called `title`; the PUBLIC name is `heading`, and only that reaches a template. */
@Component({ selector: 'fixture-panel', template: '<h2>{{ title() }}</h2>' })
export class FixturePanel {
  readonly title = input('', { alias: 'heading' });
}

/** Inherits `id` from a base in the package's other entry point, which binds the host attribute itself. */
@Component({ selector: 'fixture-checkbox', template: '<input type="checkbox" [id]="id()" />' })
export class FixtureCheckbox extends FixtureLabelled {}

/** A field decorator in the standard form, the kind ng-zorro-antd's `@WithConfig()` is. It does nothing. */
function configurable(_value: undefined, _context: ClassFieldDecoratorContext): void {}

/**
 * Inherits `id` from the same base as FixtureCheckbox, but a decorated field
 * makes TypeScript wrap the class in a function and hold the base in a local.
 */
@Component({ selector: 'fixture-switch', template: '<input type="checkbox" role="switch" [id]="id()" />' })
export class FixtureSwitch extends FixtureLabelled {
  @configurable size = 'medium';
}

/** Exposes a host directive's input as `title`; the host directive binds the attribute away. */
@Component({
  selector: 'fixture-tip',
  template: '<ng-content />',
  hostDirectives: [{ directive: FixtureTitled, inputs: ['label: title'] }],
})
export class FixtureTip {}

/**
 * Exposes nothing itself; its host directive exposes FixtureTitled's label as
 * `title`, which lands here, and FixtureTitled binds the attribute away.
 */
@Component({ selector: 'fixture-icon', template: '<ng-content />', hostDirectives: [FixtureTipped] })
export class FixtureIcon {}

/** On a native `<button>`, whose own `title` is the consumer's to want: out of scope by design. */
@Component({ selector: 'button[fixture-button]', template: '<ng-content />' })
export class FixtureButton {
  readonly title = input('');
}
