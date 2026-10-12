import { Directive, input } from '@angular/core';

/** An abstract base carrying `id` and binding nothing, published from the package's second entry point. */
@Directive()
export abstract class FixtureControl {
  readonly id = input<string | null>(null);
}
