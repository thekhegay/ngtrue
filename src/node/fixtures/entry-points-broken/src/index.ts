/**
 * Constructor injection of a class declared BELOW the injecting one. The
 * partial declaration lists `FixtureDropdown` in the factory's `deps`, which a
 * static initializer evaluates while `FixtureToggle` is defined — before
 * `FixtureDropdown` exists. `ngc` says nothing.
 */
import { Directive, ElementRef } from '@angular/core';

@Directive({ selector: '[fixtureToggle]' })
export class FixtureToggle {
  constructor(
    readonly dropdown: FixtureDropdown,
    readonly element: ElementRef<HTMLElement>,
  ) {}
}

@Directive({ selector: '[fixtureDropdown]' })
export class FixtureDropdown {}
