import * as i0 from '@angular/core';
import { Component } from '@angular/core';

class MentionList {
	static ɵfac = i0.ɵɵngDeclareFactory({
		minVersion: "12.0.0",
		version: "14.0.6",
		ngImport: i0,
		type: MentionList,
		deps: [],
		target: i0.ɵɵFactoryTarget.Component
	});
	static ɵcmp = i0.ɵɵngDeclareComponent({
		minVersion: "14.0.0",
		version: "14.0.6",
		type: MentionList,
		isStandalone: true,
		selector: "mention-list",
		ngImport: i0,
		template: "<ul class=\"mention-menu\"></ul>",
		isInline: true
	});
}
i0.ɵɵngDeclareClassMetadata({
	minVersion: "12.0.0",
	version: "14.0.6",
	ngImport: i0,
	type: MentionList,
	decorators: [{
		type: Component,
		args: [{ selector: "mention-list", template: "<ul class=\"mention-menu\"></ul>" }]
	}]
});

export { MentionList };
