import { Directive, input } from '@angular/core';

/** An abstract base carrying `id`, neutralised once here for every subclass — the fix in ngwr 98629b82. */
@Directive({ host: { '[attr.id]': 'null' } })
export abstract class FixtureLabelled {
  readonly id = input<string | null>(null);
}
