import { describe, expect, it } from 'vitest';

import { importSpecifiers } from './import-specifiers.js';

/**
 * The lexer behind `peerDependencyMismatches`, on strings rather than files.
 *
 * The fixture packages prove the check end to end; this pins each guess the
 * lexer makes, because every one of them is a place a later edit can quietly
 * start reading text as code or code as text. Most cases put a real import
 * AFTER the construct under test, on the same line where that matters, so a
 * lexer that mis-scans the construct loses the import and the case names it.
 */
describe('importSpecifiers', () => {
  it('finds every form an import is written in', () => {
    const source = [
      "import a from 'a';",
      'import { b } from "b";',
      "import type { C } from 'c';",
      "export * from 'd';",
      "export { e } from 'e';",
      "import 'f';",
      "const g = import('g');",
      "const h = require('h');",
      "import i = require('i');",
      "type J = typeof import('j');",
      "const k = await import('k', { with: { type: 'json' } });",
    ].join('\n');

    expect(importSpecifiers(source)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k']);
  });

  describe('text that spells an import', () => {
    it.each([
      ['a template printing `from "…"`', 'const s = `#${i} (from "${edge.from}" to "${edge.to}")`;'],
      ['a template writing an import line', "const line = `import { ${symbol} } from 'lucide';\\n`;"],
      ['quotes that pair across a comma', "[p.getAttribute('data-from'), p.getAttribute('data-to')];"],
      ['a string holding a whole statement', `const s = 'import x from "fake"';`],
      ['a line comment', "// import 'commented';"],
      ['a block comment', "/* export * from 'block'; */"],
      ['a JSDoc type import', "/** @type {import('jsdoc').T} */ let t;"],
      ['an object key named `from`', "const range = { from: 'q', to: 'r' };"],
      ['a call to a function named `from`', "Array.from('abc');"],
      ['`import.meta`', "const here = new URL('x', import.meta.url);"],
    ])('reads none of %s as an import', (_, source) => {
      expect(importSpecifiers(source)).toEqual([]);
    });

    it.each([
      ['a method', "this.require('getGradient', 'background-image');"],
      ['a member of another object', "module.require('y');"],
      ['a private method', "this.#require('z');"],
      ['an optional call', "maybe?.require('w');"],
      ['a method named `import`', "loader.import('v');"],
    ])('does not count `require` or `import` called as %s', (_, source) => {
      expect(importSpecifiers(source)).toEqual([]);
    });

    it.each([
      ['a concatenation', "require('pkg' + suffix);"],
      ['a variable', 'import(name);'],
      ['a template with a substitution', 'import(`pkg/${locale}`);'],
    ])('names no package for a specifier built from %s', (_, source) => {
      expect(importSpecifiers(source)).toEqual([]);
    });
  });

  describe('the regular-expression-or-division guess', () => {
    it('opens a pattern after `=`, so its text is not code', () => {
      expect(importSpecifiers("const re = /from 'x'/; import 'after';")).toEqual(['after']);
    });

    it('opens a pattern after a keyword such as `return`', () => {
      expect(importSpecifiers("function f(s) { return /from 'x'/.test(s); }")).toEqual([]);
    });

    it('keeps a `/` inside a character class from closing the pattern', () => {
      expect(importSpecifiers("const re = /[/]'/; import 'after';")).toEqual(['after']);
    });

    it.each([
      ['an identifier', "const r = a / 2; import 'after'; const t = b / 3;"],
      ['a closing parenthesis', "const avg = (a + b) / 2; import 'after'; const h = (c) / 2;"],
      ['a closing bracket', "const r = xs[0] / 2; import 'after'; const t = ys[1] / 3;"],
      ['`++`', "i++ / 2; import 'after'; j / 3;"],
      ['a non-null assertion', "const r = size()! / 2; import 'after'; const t = n! / 3;"],
      ['a keyword written as a property', "const r = range.in / 2; import 'after'; const t = range.of / 3;"],
    ])('divides after %s, so a later `/` on the line cannot close a pattern', (_, source) => {
      // Read as a pattern, the first `/` would run to the second and swallow
      // the import between them.
      expect(importSpecifiers(source)).toEqual(['after']);
    });

    it('does not let a non-null assertion turn template text into code', () => {
      // The measured case. Read as a prefix `!`, the division opened a pattern
      // that closed on the `/` inside `a/b`; the template's closing backtick
      // then opened one, the next template's text was code, and `lucide` was
      // reported while the real import after it was lost.
      const source = [
        'const w = n! / 2 + `a/b`;',
        "const hint = `add import { x } from 'lucide' to your file`;",
        "import 'after';",
      ].join('\n');

      expect(importSpecifiers(source)).toEqual(['after']);
    });

    it('reads a `!` at the start of a line as a prefix, which is all it can be there', () => {
      // `b` newline `!` is two statements, so this is a pattern, not a division.
      expect(importSpecifiers("const a = b\n!/`/.test(s); import 'after';\nconst t = `x`;")).toEqual(['after']);
    });

    it.each(['if', 'while', 'for', 'with'])('opens a pattern after the `)` of `%s (…)`', head => {
      // The one place a pattern follows a `)`. Read as a division, the backtick
      // in it would open a template that runs over the import to the next one.
      expect(importSpecifiers(`${head} (ok) /\`/.test(s); import 'after';\nconst t = \`x\`;`)).toEqual(['after']);
    });

    it('opens a pattern after `export default`', () => {
      expect(importSpecifiers("export default /from 'x'/;")).toEqual([]);
    });

    it('does not take a `.` ending a comment for a member access', () => {
      // Read off the raw source, `return` would look like a property here and
      // the pattern after it like a division.
      expect(importSpecifiers("// the end.\nreturn /`/.test(s); import 'after';\nconst t = `x`;")).toEqual(['after']);
    });

    it('takes back a pattern that reaches the end of its line unclosed', () => {
      // A variable named `of` is read as the keyword, so the lexer guesses a
      // pattern here and is wrong — a pattern cannot span a line, which is how
      // it finds out. The division on the NEXT line is the `/` a pattern
      // allowed to span lines would close on, swallowing the import.
      expect(importSpecifiers("const n = of / 2; import 'after';\nconst m = y / 3;")).toEqual(['after']);
    });
  });

  describe('templates', () => {
    it('ends a template where it ends, through nested templates and braces', () => {
      expect(importSpecifiers("const t = `${a ? '`' : `{${b}}`}`; import 'after';")).toEqual(['after']);
    });

    it("resumes the template's text after a substitution", () => {
      // The apostrophe is template text. Read as code, it opens a string that
      // runs over the import.
      expect(importSpecifiers("const t = `${n} item's`; import 'after';")).toEqual(['after']);
    });

    it('treats a multi-line template as text from end to end', () => {
      const source = ['const page = `', "import x from 'first';", "export * from 'second';", '`;'].join('\n');

      expect(importSpecifiers(source)).toEqual([]);
    });

    it('accepts a template without substitutions as a dynamic specifier', () => {
      expect(importSpecifiers('const m = import(`tpl`);')).toEqual(['tpl']);
    });
  });

  describe('strings and comments', () => {
    it('honours escaped quotes', () => {
      expect(importSpecifiers(`const s = 'it\\'s from "x"'; import 'after';`)).toEqual(['after']);
    });

    it('takes back a quote with no partner on its line', () => {
      // JSX text is not modelled; the apostrophe is the case that would
      // otherwise open a string and keep it open.
      expect(importSpecifiers("const label = <p>it's</p>;\nimport 'after';")).toEqual(['after']);
    });

    it('reads through a comment between the call and its specifier', () => {
      expect(importSpecifiers(`import(/* webpackChunkName: "chunk" */ 'chunk');`)).toEqual(['chunk']);
    });

    it('skips a hashbang', () => {
      expect(importSpecifiers("#!/usr/bin/env node\nimport 'cli';")).toEqual(['cli']);
    });

    it('ends a line comment at a lone carriage return, as the compiler does', () => {
      expect(importSpecifiers("// a comment\rimport 'after';")).toEqual(['after']);
    });
  });

  describe('the limits the documentation states', () => {
    // Pinned so that lifting one is a visible change rather than a silent one:
    // each is written down in the JSDoc as something this cannot see.

    it('reads a line of JSX text that spells a whole import as one', () => {
      expect(importSpecifiers("const el = <code>import x from 'react'</code>;")).toEqual(['react']);
    });

    it('does not count a module augmentation, which names a package without importing it', () => {
      expect(importSpecifiers("declare module '@angular/core' { interface X {} }")).toEqual([]);
    });
  });
});
