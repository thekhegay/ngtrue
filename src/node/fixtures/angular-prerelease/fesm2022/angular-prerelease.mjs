import * as i0 from '@angular/core';

// Built against a prerelease, declaring a prerelease minVersion, with a range
// whose floor is an EARLIER prerelease of the same version. Plain semver says
// 22.0.0-next.0 is below 22.0.0-next.3. The linker strips the prerelease from
// both sides before comparing, so to it both are 22.0.0 and this links.
class Early {
	static ɵfac = i0.ɵɵngDeclareFactory({
		minVersion: "12.0.0",
		version: "22.0.0-next.3",
		ngImport: i0,
		type: Early,
		deps: [],
		target: i0.ɵɵFactoryTarget.Injectable
	});
	static ɵprov = i0.ɵɵngDeclareService({
		minVersion: "22.0.0-next.3",
		version: "22.0.0-next.3",
		ngImport: i0,
		type: Early
	});
}

export { Early };
