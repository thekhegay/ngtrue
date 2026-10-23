// A dependency that imports JSON without `with { type: 'json' }`. Node refuses
// to load it; a bundler loads it.
import { codes } from 'fixture-json';

export const defaultCode = codes[0];
