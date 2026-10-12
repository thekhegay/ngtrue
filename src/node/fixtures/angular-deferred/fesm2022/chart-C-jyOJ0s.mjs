import * as i0 from "@angular/core";
import { Component, Service, inject } from "@angular/core";

// The deferred chunk. `ChartData` is an `@Service()`, which compiles to
// `ɵɵngDeclareService` with minVersion 22.0.0, so the build needs Angular 22
// while the range still says 21. Nothing imports this file statically, so a
// check that followed only `from` would never open it.

var ChartData = class ChartData {
	points = [
		1,
		2,
		3
	];
	static ɵfac = i0.ɵɵngDeclareFactory({
		minVersion: "12.0.0",
		version: "22.2.1",
		ngImport: i0,
		type: ChartData,
		deps: [],
		target: i0.ɵɵFactoryTarget.Service
	});
	static ɵprov = i0.ɵɵngDeclareService({
		minVersion: "22.0.0",
		version: "22.2.1",
		ngImport: i0,
		type: ChartData
	});
};
i0.ɵɵngDeclareClassMetadata({
	minVersion: "12.0.0",
	version: "22.2.1",
	ngImport: i0,
	type: ChartData,
	decorators: [{ type: Service }]
});
var Chart = class Chart {
	data = inject(ChartData);
	static ɵfac = i0.ɵɵngDeclareFactory({
		minVersion: "12.0.0",
		version: "22.2.1",
		ngImport: i0,
		type: Chart,
		deps: [],
		target: i0.ɵɵFactoryTarget.Component
	});
	static ɵcmp = i0.ɵɵngDeclareComponent({
		minVersion: "14.0.0",
		version: "22.2.1",
		type: Chart,
		isStandalone: true,
		selector: "fx-chart",
		ngImport: i0,
		template: `<svg></svg>`,
		isInline: true
	});
};
i0.ɵɵngDeclareClassMetadata({
	minVersion: "12.0.0",
	version: "22.2.1",
	ngImport: i0,
	type: Chart,
	decorators: [{
		type: Component,
		args: [{
			selector: "fx-chart",
			template: `<svg></svg>`
		}]
	}]
});
export { Chart };
