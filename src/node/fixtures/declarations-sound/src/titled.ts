import { Directive, input } from '@angular/core';

/** Meant to be a host directive: its `label` is exposed under whatever name the host picks. */
@Directive({ selector: '[fixtureTitled]', host: { '[attr.title]': 'null' } })
export class FixtureTitled {
  readonly label = input('');
}

/** Applies FixtureTitled to its own host and exposes its label as `title` there. */
@Directive({
  selector: '[fixtureTipped]',
  hostDirectives: [{ directive: FixtureTitled, inputs: ['label: title'] }],
})
export class FixtureTipped {}
