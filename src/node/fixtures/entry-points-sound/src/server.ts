/** Reads `window` only behind a guard, so importing it on a server is harmless. */
const isBrowser = typeof window !== 'undefined';

export function pixelRatio(): number {
  return isBrowser ? window.devicePixelRatio : 1;
}
