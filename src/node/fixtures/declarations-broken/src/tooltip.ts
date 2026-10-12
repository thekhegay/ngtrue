import { Directive, input } from '@angular/core';

/** Meant to be a host directive: a tooltip's text, and nothing bound on the host. */
@Directive({ selector: '[fixtureTooltip]' })
export class FixtureTooltip {
  readonly text = input('');
}

/**
 * Puts FixtureTooltip on its own host and exposes its text as `title`. Angular
 * applies a host directive's host directives to the same element, under the
 * names THIS declaration gives them, so `title` reaches whatever host carries it.
 */
@Directive({
  selector: '[fixtureHasTooltip]',
  hostDirectives: [{ directive: FixtureTooltip, inputs: ['text: title'] }],
})
export class FixtureHasTooltip {}

/** The same exposure on an abstract base, which a subclass inherits with the host directive. */
@Directive({ hostDirectives: [{ directive: FixtureTooltip, inputs: ['text: title'] }] })
export abstract class FixtureTooltipped {}
