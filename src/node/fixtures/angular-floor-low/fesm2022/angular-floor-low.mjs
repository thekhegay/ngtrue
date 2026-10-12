import * as i0 from '@angular/core';
import { Injectable } from '@angular/core';
import { MentionList } from './chunk-mention-list.mjs';

// The shape dmacfarlane/angular-mentions#238 reported: a peer range written
// for an older Angular, and a build whose declarations need a newer one. The
// entry file on its own needs no more than 12.0.0, which the range admits. The
// declaration that needs 14.0.0 is in a chunk only this import reaches, so the
// finding exists only if the check follows relative imports out of the file
// `exports` names.
//
// One line per call here, the way older ng-packagr builds printed them.
class MentionConfig {
}
MentionConfig.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "14.0.6", ngImport: i0, type: MentionConfig, deps: [], target: i0.ɵɵFactoryTarget.Injectable });
MentionConfig.ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "14.0.6", ngImport: i0, type: MentionConfig, providedIn: 'root' });
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "14.0.6", ngImport: i0, type: MentionConfig, decorators: [{ type: Injectable, args: [{ providedIn: 'root' }] }] });

export { MentionConfig, MentionList };
