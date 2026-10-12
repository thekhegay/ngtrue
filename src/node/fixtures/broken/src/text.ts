// The text from the sound fixture, and AFTER it one real import of each form.
// A scanner that blanked too much would lose the imports below; one that
// blanked too little would report the text. The spec names every finding, so
// either mistake shows up as a specific wrong line.

export const dangling = (index: number, edge: { from: string; to: string }): string =>
  `#${index} (from "${edge.from}" to "${edge.to}")`;
export const importLine = (symbol: string): string => `import { ${symbol} } from 'lucide';\n`;
export const ends = (path: Element) => [path.getAttribute('data-from'), path.getAttribute('data-to')];
export const quotes = /['"`/]/;
export const half = (a: number, b: number): number => a / b / 2;

// A substitution holding a backtick and a nested template with braces: the
// template must end where it ends, or everything after it is read as text.
export const nested = (a: boolean, b: string): string => `${a ? '`' : `{${b}}`}`;

// A division after a non-null assertion, and a pattern holding a backtick after
// the `)` of an `if`. Guessed the wrong way, either one leaves a backtick that
// opens a template running over the imports below.
export const centre = (size: () => number | null): string => `${size()! / 2}px` + `/2`;
export const ticks = (s: string): number => {
  if (s.length > 0) /`/.test(s);
  return s.length;
};

import 'undeclared-side-effect';
export * from 'undeclared-re-export';
export const lazy = () => import(/* webpackChunkName: "lazy" */ 'undeclared-dynamic');
