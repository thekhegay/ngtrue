import * as i0 from '@angular/core';
import { Component } from '@angular/core';

// Two things the check cannot read, and must say so rather than skip:
//
// - the component's declaration has its keys in an order the compiler never
//   writes. The linker reads it through an AST and would not mind; this check
//   reads text, and a declaration it cannot read might be the one that needs
//   the newest Angular. The class metadata after it is what a reader that
//   searched ahead for the two keys would find instead: it would take this
//   component for a 12.0.0 declaration and report nothing.
// - the manifest's `@angular/core` range is a `workspace:` protocol, which a
//   pnpm workspace rewrites at publish time. Checked before that rewrite,
//   there is no floor to compare with.
class Reprinted {
	static ɵfac = i0.ɵɵngDeclareFactory({
		minVersion: "12.0.0",
		version: "17.3.0",
		ngImport: i0,
		type: Reprinted,
		deps: [],
		target: i0.ɵɵFactoryTarget.Component
	});
	static ɵcmp = i0.ɵɵngDeclareComponent({
		version: "17.3.0",
		minVersion: "17.2.0",
		type: Reprinted,
		isStandalone: true,
		selector: "reprinted",
		ngImport: i0,
		template: "",
		isInline: true
	});
}
i0.ɵɵngDeclareClassMetadata({
	minVersion: "12.0.0",
	version: "17.3.0",
	ngImport: i0,
	type: Reprinted,
	decorators: [{ type: Component, args: [{ selector: "reprinted", template: "" }] }]
});

export { Reprinted };
