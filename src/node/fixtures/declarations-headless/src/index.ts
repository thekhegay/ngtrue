/**
 * A headless library, the shape of ngx-mask or ngx-infinite-scroll: every
 * declaration sits on an element the consumer chose, so nothing is in scope
 * for `globalAttributeInputs`, and the package is still in partial form.
 */
import { Directive, input } from '@angular/core';

/** A `title` input on an attribute directive, where the element's own title is the consumer's to want. */
@Directive({ selector: '[fixtureHint]' })
export class FixtureHint {
  readonly title = input('');
}

/** On a native `<input>`, which the consumer wrote. */
@Directive({ selector: 'input[fixtureMask]' })
export class FixtureMask {
  readonly mask = input('');
}

/** Abstract, with no selector: never a host itself. */
@Directive()
export abstract class FixtureScroller {
  readonly distance = input(0);
}
