// Text that spells an import and is not one. Each shape here was read as an
// import of a real library before the scanner learned which characters are
// code, so a pass on this package is the scanner telling them apart.

// A template literal printing a sentence with `from "…"` inside it.
export const dangling = (index: number, edge: { from: string; to: string }): string =>
  `#${index} (from "${edge.from}" to "${edge.to}")`;

// A schematic writing an import line into somebody else's file.
export const importLine = (symbol: string): string => `import { ${symbol} } from 'lucide';\n`;

// Two calls whose quotes pair across the comma when nothing tracks strings.
export const ends = (path: Element) => [path.getAttribute('data-from'), path.getAttribute('data-to')];

// A method that happens to be called `require`, called as one.
export class Harness {
  require(name: string): string {
    return name;
  }

  gradient(): string {
    return this.require('getGradient');
  }
}

// A pattern holding every quote and a slash in a class, then two divisions.
export const quotes = /['"`/]/;
export const half = (a: number, b: number): number => a / b / 2;

// A non-null assertion before a division, with a `/` in a template later on
// the line. Read as a prefix `!`, the division opened a pattern that closed
// inside the template, and the text of the template below was read as code.
export const centre = (size: () => number | null): string => `${size()! / 2}px` + `/2`;
export const hint = `add import { WrIcon } from 'lucide' to your component`;
