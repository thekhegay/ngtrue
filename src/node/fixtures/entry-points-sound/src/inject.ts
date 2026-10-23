/**
 * `inject()` of a class declared BELOW the injecting one, which loads: the call
 * runs when the directive is created, long after both classes are defined.
 * `@typescript-eslint/no-use-before-define` reports this file and passes the
 * broken package's constructor injection, which is the other way round.
 */
import { Directive, inject } from '@angular/core';

@Directive({ selector: '[fixtureToggle]' })
export class FixtureToggle {
  readonly dropdown = inject(FixtureDropdown);
}

@Directive({ selector: '[fixtureDropdown]' })
export class FixtureDropdown {}
