import { Directive, input } from '@angular/core';

/** Meant to be a host directive, and it binds nothing on the host. */
@Directive({ selector: '[fixtureCollapsible]' })
export class FixtureCollapsible {
  readonly collapsed = input(false);
}
