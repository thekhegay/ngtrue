// A named import from a CommonJS package whose exports Node's lexer cannot
// see, the shape of lodash. Node refuses to link it; a bundler loads it.
import { debounce } from 'fixture-cjs';

export const onResize = debounce(() => 1);
