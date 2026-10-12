/**
 * The module specifiers a TypeScript or JavaScript source names IN AN IMPORT
 * POSITION, in source order.
 *
 * Internal to `ngtrue/node`; `peerDependencyMismatches` is its one caller.
 *
 * ## Why a lexer, and why not the compiler
 *
 * The version this replaced matched `from '…'`, `import('…')` and `require('…')`
 * against the raw text with comments stripped, and on a real library most of
 * what it found was not an import. Run over ngwr's `projects/lib`, eight of its
 * eleven findings were text: a template literal printing
 * `` `#${i} (from "${edge.from}" to …)` ``, schematics that WRITE import lines
 * into a consumer's file (`` `import { ${symbol} } from '${subpath}';` ``), a
 * call `path.getAttribute('data-from'), path.getAttribute('data-to')` whose
 * quotes paired across the comma, and a harness method called
 * `this.require('getGradient', …)`. ngwr's own spec had guarded against most of
 * that (a specifier-shape filter and no `require` matching, added in
 * faf216cd) and the guards did not survive being extracted into this package.
 *
 * The cure is to know which characters are code. So this walks the source once
 * and blanks everything that is not — comments, string literals, template
 * literal text, regular expression literals — and then accepts a string
 * literal only when the CODE in front of it is `from`, a bare `import`, or
 * `import(` / `require(`. Text inside a string can never look like code again,
 * however much of an import statement it spells.
 *
 * Not the TypeScript scanner, for three reasons that each held on their own:
 * this check is synchronous and needs nothing installed, and the compiler is an
 * optional peer here; `ts.preProcessFile`, the obvious call, counts
 * `this.require('a')` as a dependency (measured), which is one of the false
 * findings this exists to remove; and a source that uses syntax the installed
 * compiler does not know yet should still be read, not refused.
 *
 * It was held against `ts.preProcessFile` before it shipped, over 4,209 files:
 * ngwr's library source with its specs, ngtrue's own, and the published
 * bundles of Angular, rxjs, VitePress and typedoc. The two named the same
 * specifiers in all but three. Two are the intended difference — the harness's
 * `this.require(…)` and a `freeModule.require('util')` inside VitePress — and
 * the third is a compiler-cli bundle chunk in which `preProcessFile` loses its
 * place partway down and misses thirty-two real `import` statements that this
 * finds. The two TypeScript readings and the statement-head rule below came
 * after that comparison; over 6,325 files — the same packages with their
 * declaration files — they changed no specifier outside the fixtures written
 * for them.
 *
 * ## The one guess a JavaScript lexer has to make
 *
 * Whether `/` starts a regular expression or divides. The grammar decides that
 * by parse context, which a lexer does not have, so this decides by the token
 * before it: after an identifier, a number, a literal, `]`, `++` or `--` it
 * divides; after a `)` it divides unless that parenthesis closed `if (…)`,
 * `while (…)`, `for (…)` or `with (…)`, the four places a statement and so a
 * pattern can follow one; after anything else, or after a keyword such as
 * `return`, it opens a regular expression.
 *
 * Two TypeScript readings sit on top of that, and each replaced a guess that
 * was measured going wrong. A `!` straight after an operand, on the same line,
 * is a non-null assertion, so `size()! / 2` divides. Read as a prefix `!`, it
 * opened a pattern that closed on a `/` inside a template later on the line,
 * and from there the template's text was read as code: `` n! / 2 + `a/b` ``
 * followed by a template spelling `from 'lucide'` reported `lucide`. And a
 * word after `.` is a property, so `range.in / 2` divides although `in` is a
 * keyword.
 *
 * A wrong guess is not always local, which is why the guesses are made with
 * care rather than why a wrong one would be harmless. A regular expression or
 * a quoted string cannot span a line, so one that reaches the end of its line
 * unterminated is taken back and the character read as plain code. A template
 * literal CAN span lines: a division read as a pattern can close on a `/`
 * inside one, and a pattern read as a division lets a backtick inside it open
 * one, and either way code reads as text and text as code until the backticks
 * pair up again — which loses the imports after it and, when a later
 * template's text spells an import, reports one. The token cannot settle three
 * shapes, and each is read the other way: a variable named `of` or `await`
 * before a division, an object literal written straight before one
 * (`{} / 2`), and a pattern straight after `for await (…)`.
 *
 * ## What it cannot see
 *
 * A specifier that is not a literal — `import(name)`, `require(base + '/x')`,
 * or a template literal with a substitution — is invisible, because there is
 * no package name to read until the program runs. JSX text is not modelled:
 * an apostrophe in it is taken back at the end of its line like any other
 * unterminated quote, and a line of JSX text that spells a whole import —
 * `<code>import x from 'y'</code>` — is read as one. A module augmentation,
 * `declare module 'pkg' { … }`, names a package without importing it and is
 * not counted, where `ts.preProcessFile` counts it.
 */
export function importSpecifiers(source: string): readonly string[] {
  const { code, literals } = lex(source);
  return literals.filter(literal => inImportPosition(code, literal)).map(literal => literal.value);
}

/** A string or no-substitution template literal, with the quotes. */
interface Literal {
  /** Index of the opening quote. */
  readonly start: number;
  /** Index just past the closing quote. */
  readonly end: number;
  /** The text between the quotes, as written — escapes are not decoded. */
  readonly value: string;
  readonly template: boolean;
}

/**
 * Keywords after which `/` opens a regular expression. Anything else spelled
 * like an identifier is an operand, so the `/` after it divides.
 */
const OPERATOR_KEYWORDS = new Set([
  'await',
  'case',
  'default',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'new',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
]);

/**
 * Keywords whose parenthesised head is followed by a statement, so the `/`
 * after its `)` opens a regular expression: ``if (ok) /`/.test(s)``. After
 * every other `)` — a call, a grouping — it divides.
 */
const STATEMENT_HEADS = new Set(['for', 'if', 'while', 'with']);

/**
 * The source with every non-code character blanked to a space (newlines kept,
 * so offsets and line structure survive), and the literals it found.
 */
function lex(source: string): { code: string; literals: Literal[] } {
  const out = source.split('');
  const literals: Literal[] = [];
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k += 1) if (out[k] !== '\n') out[k] = ' ';
  };

  // The brace depth at which each open template substitution began. A `}` at
  // that depth closes the substitution and resumes the template's text; any
  // other `}` closes a block or an object written inside it.
  const substitutions: number[] = [];
  // For each open `(`, whether a statement head opened it — what the `/` after
  // the matching `)` is read as.
  const parentheses: boolean[] = [];
  // The keyword or identifier that was the previous token, when it was one and
  // not a property name; null after anything else.
  let word: string | null = null;
  let depth = 0;
  let regexMayFollow = true;
  let index = 0;

  if (source.startsWith('#!')) {
    index = lineEnd(source, 0);
    blank(0, index);
  }

  while (index < source.length) {
    const char = source[index] as string;
    const next = source[index + 1];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '/' && next === '/') {
      const end = lineEnd(source, index);
      blank(index, end);
      index = end;
      continue;
    }

    if (char === '/' && next === '*') {
      const close = source.indexOf('*/', index + 2);
      const end = close === -1 ? source.length : close + 2;
      blank(index, end);
      index = end;
      continue;
    }

    const previousWord = word;
    word = null;

    if (char === "'" || char === '"') {
      const end = stringEnd(source, index);
      if (end === -1) {
        // A quote with no partner before the end of its line is not a string
        // literal — that would be a syntax error — so it came from text this
        // lexer misread. Taking it back keeps the damage to this one character.
        index += 1;
        regexMayFollow = true;
        continue;
      }
      literals.push({ start: index, end, value: source.slice(index + 1, end - 1), template: false });
      blank(index, end);
      index = end;
      regexMayFollow = false;
      continue;
    }

    if (char === '`') {
      const { end, substituted } = templateSegmentEnd(source, index + 1);
      blank(index, end);
      if (substituted) {
        substitutions.push(depth);
        regexMayFollow = true;
      } else {
        literals.push({ start: index, end, value: source.slice(index + 1, end - 1), template: true });
        regexMayFollow = false;
      }
      index = end;
      continue;
    }

    if (char === '}' && substitutions.length > 0 && substitutions[substitutions.length - 1] === depth) {
      const { end, substituted } = templateSegmentEnd(source, index + 1);
      blank(index, end);
      if (!substituted) substitutions.pop();
      regexMayFollow = substituted;
      index = end;
      continue;
    }

    if (char === '/' && regexMayFollow) {
      const end = regexEnd(source, index);
      if (end !== -1) {
        blank(index, end);
        index = end;
        regexMayFollow = false;
        continue;
      }
    }

    if (isIdentifierPart(char)) {
      // Identifiers, keywords and numbers alike: all of them are operands
      // except the keywords listed above, and those too when written as a
      // property — `range.in / 2` divides. Starting a number here is harmless,
      // since `1.5` reads as `1`, `.`, `5` and every piece is an operand.
      let end = index + 1;
      while (end < source.length && isIdentifierPart(source[end] as string)) end += 1;
      // Read off the blanked copy, so a `.` ending a comment or a string on the
      // way back is not taken for a member access.
      const property = out[previousSignificant(out, index)] === '.';
      const text = source.slice(index, end);
      regexMayFollow = !property && OPERATOR_KEYWORDS.has(text);
      word = property ? null : text;
      index = end;
      continue;
    }

    if ((char === '+' || char === '-') && next === char) {
      // `i++ / 2` divides; a lone `+` before `/` would open a pattern.
      index += 2;
      regexMayFollow = false;
      continue;
    }

    if (
      char === '!' &&
      next !== '=' &&
      !regexMayFollow &&
      !out.slice(previousSignificant(out, index) + 1, index).includes('\n')
    ) {
      // A `!` straight after an operand is TypeScript's non-null assertion, so
      // `size()! / 2` divides. JavaScript has no `!` in that position, except
      // as a prefix on the next line after an inserted semicolon — hence the
      // line-break test, which TypeScript's own parser makes too.
      index += 1;
      continue;
    }

    if (char === '(') parentheses.push(previousWord !== null && STATEMENT_HEADS.has(previousWord));
    if (char === '{') depth += 1;
    else if (char === '}') depth -= 1;
    regexMayFollow = char === ')' ? (parentheses.pop() ?? false) : char !== ']';
    index += 1;
  }

  return { code: out.join(''), literals };
}

/** Where the line holding `from` ends: `\r` ends one as well as `\n`, as it does for the compiler. */
function lineEnd(source: string, from: number): number {
  let index = from;
  while (index < source.length && source[index] !== '\n' && source[index] !== '\r') index += 1;
  return index;
}

/** Index past the closing quote, or -1 when the line ends first. */
function stringEnd(source: string, start: number): number {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      // A backslash before a line break continues the string onto the next
      // line, and `\r\n` is one break, not two.
      index += source[index + 1] === '\r' && source[index + 2] === '\n' ? 3 : 2;
      continue;
    }
    if (char === quote) return index + 1;
    if (char === '\n' || char === '\r') return -1;
    index += 1;
  }
  return -1;
}

/**
 * From just inside a template's text to just past the backtick that ends it
 * (`substituted: false`) or the `${` that interrupts it (`substituted: true`).
 * An unterminated template runs to the end of the file, as the grammar says.
 */
function templateSegmentEnd(source: string, from: number): { end: number; substituted: boolean } {
  let index = from;
  while (index < source.length) {
    const char = source[index];
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (char === '`') return { end: index + 1, substituted: false };
    if (char === '$' && source[index + 1] === '{') return { end: index + 2, substituted: true };
    index += 1;
  }
  return { end: source.length, substituted: false };
}

/**
 * Index past a regular expression literal and its flags, or -1 when the line
 * ends first — in which case the `/` was a division after all. A `/` inside a
 * character class does not close the pattern, which is the case a naive scan
 * gets wrong: `/[/]/`.
 */
function regexEnd(source: string, start: number): number {
  let index = start + 1;
  let inClass = false;
  while (index < source.length) {
    const char = source[index];
    if (char === '\n' || char === '\r') return -1;
    if (char === '\\') {
      index += 2;
      continue;
    }
    if (inClass) {
      if (char === ']') inClass = false;
    } else if (char === '[') {
      inClass = true;
    } else if (char === '/') {
      index += 1;
      while (index < source.length && isIdentifierPart(source[index] as string)) index += 1;
      return index;
    }
    index += 1;
  }
  return -1;
}

function isIdentifierPart(char: string): boolean {
  return /[\w$]/.test(char) || char.charCodeAt(0) > 0x7f;
}

/**
 * Whether the code in front of a literal makes it a module specifier.
 *
 * `from '…'` covers every static `import … from` and `export … from`; nothing
 * else in the language puts a string literal straight after `from`. A bare
 * `import '…'` is a side-effect import. `import(…)` and `require(…)` count only
 * when the literal is the whole first argument, and `require` only as a bare
 * identifier: `this.require('a')`, `module.require('a')` and a private
 * `#require` are somebody's method, and `require('a' + b)` names no package
 * that can be read.
 */
function inImportPosition(code: string, literal: Literal): boolean {
  if (!literal.template) {
    const before = wordBefore(code, literal.start);
    if (before !== null && !before.member && (before.word === 'from' || before.word === 'import')) return true;
  }

  const open = previousSignificant(code, literal.start);
  if (open === -1 || code[open] !== '(') return false;
  const callee = wordBefore(code, open);
  if (callee === null || callee.member) return false;
  if (callee.word !== 'import' && callee.word !== 'require') return false;
  const after = nextSignificant(code, literal.end);
  return code[after] === ')' || code[after] === ',';
}

/** The identifier ending just before `index` (whitespace allowed between), and whether it is a member. */
function wordBefore(code: string, index: number): { word: string; member: boolean } | null {
  const end = previousSignificant(code, index) + 1;
  if (end === 0 || !isIdentifierPart(code[end - 1] as string)) return null;
  let start = end - 1;
  while (start > 0 && isIdentifierPart(code[start - 1] as string)) start -= 1;
  if (code[start - 1] === '#') return { word: code.slice(start, end), member: true };
  const dot = previousSignificant(code, start);
  return { word: code.slice(start, end), member: dot !== -1 && code[dot] === '.' };
}

function previousSignificant(code: ArrayLike<string>, index: number): number {
  let at = index - 1;
  while (at >= 0 && /\s/.test(code[at] as string)) at -= 1;
  return at;
}

function nextSignificant(code: string, index: number): number {
  let at = index;
  while (at < code.length && /\s/.test(code[at] as string)) at += 1;
  return at;
}
