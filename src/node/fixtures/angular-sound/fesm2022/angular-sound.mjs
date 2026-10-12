import * as i0 from '@angular/core';
import { Component, ViewEncapsulation } from '@angular/core';

// Partial-compilation output in the shape the Angular package builders write
// it today: one key per line, so a pattern that expects the whole call on one
// line reads nothing here.
class SoundBadge {
	static ɵfac = i0.ɵɵngDeclareFactory({
		minVersion: "12.0.0",
		version: "14.2.0",
		ngImport: i0,
		type: SoundBadge,
		deps: [],
		target: i0.ɵɵFactoryTarget.Component
	});
	static ɵcmp = i0.ɵɵngDeclareComponent({
		minVersion: "14.0.0",
		version: "14.2.0",
		type: SoundBadge,
		isStandalone: true,
		selector: "sound-badge",
		ngImport: i0,
		template: "<ng-content />",
		isInline: true,
		encapsulation: i0.ViewEncapsulation.None
	});
}
i0.ɵɵngDeclareClassMetadata({
	minVersion: "12.0.0",
	version: "14.2.0",
	ngImport: i0,
	type: SoundBadge,
	decorators: [{
		type: Component,
		args: [{
			selector: "sound-badge",
			template: "<ng-content />",
			encapsulation: ViewEncapsulation.None
		}]
	}]
});

export { SoundBadge };
