import { Component } from '@angular/core';

// Source, not output. The manifest beside it describes a build that has not
// run, so the declarations the check reads do not exist yet: there is no
// `fesm2022/` here at all.
@Component({
  selector: 'unbuilt-badge',
  template: '<ng-content />',
})
export class UnbuiltBadge {}
