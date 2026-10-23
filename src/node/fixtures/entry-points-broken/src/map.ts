/** Imports a dependency that reads the DOM when it loads — bluehalo/ngx-leaflet#369. */
import { map } from 'fixture-map';

export function createMap(element: HTMLElement): { element: HTMLElement } {
  return map(element);
}
