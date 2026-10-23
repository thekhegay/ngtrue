/** Nothing wrong here: a broken package is reported per entry point, not as a whole. */
export const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));
