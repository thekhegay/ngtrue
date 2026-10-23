/**
 * A host directive declared below its host. `forwardRef` does not help: the
 * partial declaration calls it while the host is defined, as
 * graycoreio/daffodil#4593 found.
 */
import { Directive, forwardRef } from '@angular/core';

@Directive({ selector: '[fixtureBoundary]', hostDirectives: [forwardRef(() => FixtureRoving)] })
export class FixtureBoundary {}

@Directive({ selector: '[fixtureRoving]' })
export class FixtureRoving {}
