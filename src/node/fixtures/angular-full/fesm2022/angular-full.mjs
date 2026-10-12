import * as i0 from '@angular/core';

// Full-compilation output: what `compilationMode: "full"` emits, and what a
// library build used to publish before partial compilation. These are the
// definitions themselves rather than declarations for a linker, so they carry
// no minVersion — and they are tied to the exact Angular that compiled them,
// which no peer range can describe.
class FullBadge {
	static ɵfac = function FullBadge_Factory(__ngFactoryType__) {
		return new (__ngFactoryType__ || FullBadge)();
	};
	static ɵcmp = /*@__PURE__*/ i0.ɵɵdefineComponent({
		type: FullBadge,
		selectors: [["full-badge"]],
		decls: 0,
		vars: 0,
		template: function FullBadge_Template(rf, ctx) {},
		encapsulation: 2
	});
}

export { FullBadge };
