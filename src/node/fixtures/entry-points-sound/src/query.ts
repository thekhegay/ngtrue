/** A signal query whose predicate is declared above the component that queries it. */
import { Component, Directive, contentChild } from '@angular/core';

@Directive({ selector: '[fixtureButtonLoading]' })
export class FixtureButtonLoading {}

@Component({ selector: 'fixture-button', template: '<ng-content />' })
export class FixtureButton {
  readonly loading = contentChild(FixtureButtonLoading);
}
