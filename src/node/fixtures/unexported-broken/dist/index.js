import { BtnBase } from './types.js';

export class Btn extends BtnBase {
  shape = 'rounded';
  press() {}
  register() {
    return () => {};
  }
}
export function createBtn() {
  return new Btn();
}
export const DEFAULT_SHAPE = 'rounded';
export function pressAll() {}
