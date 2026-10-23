/**
 * Constructor injection of a class declared ABOVE the injecting one. The same
 * two classes as the broken package's root, in the other order — the one
 * difference between a bundle that loads unlinked and one that does not.
 */
import { Directive, ElementRef } from '@angular/core';

@Directive({ selector: '[fixtureDropdown]' })
export class FixtureDropdown {}

@Directive({ selector: '[fixtureToggle]' })
export class FixtureToggle {
  constructor(
    readonly dropdown: FixtureDropdown,
    readonly element: ElementRef<HTMLElement>,
  ) {}
}
