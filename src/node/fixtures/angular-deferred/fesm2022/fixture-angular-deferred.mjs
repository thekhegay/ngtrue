import * as i0 from "@angular/core";
import { Component } from "@angular/core";

// A real `@angular/build:library` build, as it came out but for these comments
// and the source-map line. `@defer` moved `Chart` out of this file: the
// compiler drops the static import of a deferred dependency, so the bundler
// gives it a chunk that only the `import()` calls below reach. Everything
// declared here links on Angular 21, which the range admits.

var Dashboard = class Dashboard {
	static ɵfac = i0.ɵɵngDeclareFactory({
		minVersion: "12.0.0",
		version: "22.2.1",
		ngImport: i0,
		type: Dashboard,
		deps: [],
		target: i0.ɵɵFactoryTarget.Component
	});
	static ɵcmp = i0.ɵɵngDeclareComponent({
		minVersion: "17.0.0",
		version: "22.2.1",
		type: Dashboard,
		isStandalone: true,
		selector: "fx-dashboard",
		ngImport: i0,
		template: `@defer (on viewport) { <fx-chart /> } @placeholder { <p>Chart</p> }`,
		isInline: true,
		deferBlockDependencies: [() => [import("./chart-C-jyOJ0s.mjs").then((m) => m.Chart)]]
	});
};
i0.ɵɵngDeclareClassMetadataAsync({
	minVersion: "18.0.0",
	version: "22.2.1",
	ngImport: i0,
	type: Dashboard,
	resolveDeferredDeps: () => [import("./chart-C-jyOJ0s.mjs").then((m) => m.Chart)],
	resolveMetadata: (Chart) => ({
		decorators: [{
			type: Component,
			args: [{
				selector: "fx-dashboard",
				imports: [Chart],
				template: `@defer (on viewport) { <fx-chart /> } @placeholder { <p>Chart</p> }`
			}]
		}],
		ctorParameters: null,
		propDecorators: null
	})
});
export { Dashboard };
