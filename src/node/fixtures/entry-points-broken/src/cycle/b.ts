/**
 * A base class whose module imports a chunk that extends it, so the two import
 * each other. Imported first, this module hands evaluation to the chunk, which
 * reads `FixtureBase` before this file has declared it.
 */
import './chunk.js';

export class FixtureBase {}
