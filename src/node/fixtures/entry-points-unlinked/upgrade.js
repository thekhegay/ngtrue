// A package neither declared nor installed, the way `@angular/common/upgrade`
// imports `@angular/upgrade`: the entry point is for consumers who have it.
import { downgradeInjectable } from 'fixture-not-installed';

export const downgraded = downgradeInjectable;
