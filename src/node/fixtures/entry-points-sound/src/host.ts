/** A host directive declared above its host, `forwardRef` kept as the broken package writes it. */
import { Directive, forwardRef } from '@angular/core';

@Directive({ selector: '[fixtureRoving]' })
export class FixtureRoving {}

@Directive({ selector: '[fixtureBoundary]', hostDirectives: [forwardRef(() => FixtureRoving)] })
export class FixtureBoundary {}
