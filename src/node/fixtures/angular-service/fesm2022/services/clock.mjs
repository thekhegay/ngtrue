import * as i0 from '@angular/core';
import { Service } from '@angular/core';

// `@Service()` compiles to `ɵɵngDeclareService`, which no linker before
// Angular 22 knows, and its declared minVersion says so. This file is reached
// only through the `./services/*` pattern, so it is read only if the check
// expands wildcard subpaths instead of skipping them.
class Clock {
	static ɵfac = i0.ɵɵngDeclareFactory({
		minVersion: "12.0.0",
		version: "22.0.0",
		ngImport: i0,
		type: Clock,
		deps: [],
		target: i0.ɵɵFactoryTarget.Injectable
	});
	static ɵprov = i0.ɵɵngDeclareService({
		minVersion: "22.0.0",
		version: "22.0.0",
		ngImport: i0,
		type: Clock
	});
}
i0.ɵɵngDeclareClassMetadata({
	minVersion: "12.0.0",
	version: "22.0.0",
	ngImport: i0,
	type: Clock,
	decorators: [{ type: Service }]
});

export { Clock };
