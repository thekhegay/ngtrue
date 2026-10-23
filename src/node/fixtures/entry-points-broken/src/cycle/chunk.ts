/** The shared chunk: evaluated before `b.js` when `b.js` is the entry, and after it when `a.js` is. */
import { FixtureBase } from './b.js';

export class FixtureDerived extends FixtureBase {}
