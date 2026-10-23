/**
 * Enters the cycle from the chunk's side, so `b.js` finishes first and this
 * entry point loads. A process that imported it before `./cycle-b` would then
 * pass `./cycle-b` too, which is why every entry point gets a fresh one.
 */
import { FixtureDerived } from './chunk.js';

export const derived = new FixtureDerived();
