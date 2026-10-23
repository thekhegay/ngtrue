/** A signal query whose predicate is declared below the component — angular/components#32408. */
import { Component, Directive, contentChild } from '@angular/core';

@Component({ selector: 'fixture-button', template: '<ng-content />' })
export class FixtureButton {
  readonly loading = contentChild(FixtureButtonLoading);
}

@Directive({ selector: '[fixtureButtonLoading]' })
export class FixtureButtonLoading {}
