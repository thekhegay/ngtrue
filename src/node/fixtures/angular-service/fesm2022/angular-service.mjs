import * as i0 from '@angular/core';
import { Component } from '@angular/core';

// Everything in the root entry point links on Angular 21. A peer range of
// `^21.0.0` looks right from here.
class Ticker {
	static ɵfac = i0.ɵɵngDeclareFactory({
		minVersion: "12.0.0",
		version: "22.0.0",
		ngImport: i0,
		type: Ticker,
		deps: [],
		target: i0.ɵɵFactoryTarget.Component
	});
	static ɵcmp = i0.ɵɵngDeclareComponent({
		minVersion: "17.0.0",
		version: "22.0.0",
		type: Ticker,
		isStandalone: true,
		selector: "ticker",
		ngImport: i0,
		template: "",
		isInline: true
	});
}
i0.ɵɵngDeclareClassMetadata({
	minVersion: "12.0.0",
	version: "22.0.0",
	ngImport: i0,
	type: Ticker,
	decorators: [{ type: Component, args: [{ selector: "ticker", template: "" }] }]
});

export { Ticker };
