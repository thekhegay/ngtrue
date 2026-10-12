import { PanelBase } from './hidden.js';

export class Panel extends PanelBase {
  #state;
  label = { text: '' };
  map(value) {
    return value;
  }
}
export class PanelRegistry {}
export class ɵPanelInternals {}
export function configure() {}
