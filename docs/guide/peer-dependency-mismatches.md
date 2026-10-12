# peerDependencyMismatches

`ngtrue/node`

Every package a shipped source imports and the manifest does not declare, and
every dependency the manifest declares and no shipped source imports. One
sentence each; an empty array is a pass.

## A runnable example

```ts
import { peerDependencyMismatches } from 'ngtrue/node';

it('declares what it imports, and imports what it declares', () => {
  expect(peerDependencyMismatches({ packageDir: '.', tsconfig: 'tsconfig.build.json' })).toEqual([]);
});
```

Prefer `tsconfig` to a hand-written list. The compiler already knows which
files are left out of the package; restating it here gives you two lists that
agree until somebody adds a third kind of test file to one of them.

## A subtree that ships and runs somewhere else

An Angular library with schematics imports `@angular-devkit/schematics` and
`@schematics/angular` from them and declares neither, correctly: the Angular CLI
runs schematics and brings both packages itself. The build tsconfig cannot say
so, because those files do ship. Say it with `exclude`, which is **added** to
the tsconfig's own list:

```ts
it('declares what it imports, and imports what it declares', () => {
  expect(
    peerDependencyMismatches({ packageDir: '.', tsconfig: 'tsconfig.build.json', exclude: ['schematics'] }),
  ).toEqual([]);
});
```

A pattern naming a directory leaves out everything under it, the way a
tsconfig `exclude` reads. Without `tsconfig`, `exclude` replaces the default
list (specs, tests, declaration files and fixtures) instead of adding to it.

## Both directions, and why each one matters

**Undeclared** is the one that breaks an install. A bundler resolves whatever
happens to be in the workspace's `node_modules`, so an import of a package
nobody declared builds green and ships — and the failure lands in a consumer's
app as `ERR_MODULE_NOT_FOUND`, but only in an app that does not already have the
package. Every framework app has the framework's own packages, which is exactly
why those are the ones that go undeclared for years.

**Declared and never imported** is quieter and still wrong. A peer range is not
a hint, it is a resolvable constraint: npm installs optional peers when they are
present and errors on a conflict, so a range on a package the library never
loads can fail somebody's install over code that does not run. The usual culprit
is a package that used to be imported. The next most common is one whose data is
passed IN as an argument rather than imported — an icon set, a date library
behind an adapter — which feels like a dependency and is not one.

For the cases neither a manifest nor a source scan can settle, `ignore` drops a
package from both directions.

## How imports are found, and what that misses

By lexing the source. Comments, string literals, template text and regular
expressions are blanked first, and a string literal counts as a specifier only
when the code in front of it is `from`, a bare `import`, or `import(` /
`require(` with the literal as the whole first argument. `require` counts only
as a bare identifier: `this.require('a')` is somebody's method.

Text that merely spells an import is therefore never one. All of these were
read as imports before, on a real library:

```ts
const dangling = `#${index} (from "${edge.from}" to "${edge.to}")`;
const line = `import { ${symbol} } from '${subpath}';`;
const ends = [path.getAttribute('data-from'), path.getAttribute('data-to')];
const gradient = this.require('getGradient');
```

Not a parser, because this runs against `.ts` that may use syntax the installed
TypeScript does not know yet, and a scanner that throws on one file is worse
than one that is approximate. Not `ts.preProcessFile` either, which reports
`this.require('a')` as an import.

What it cannot see is a specifier that is not a literal — a computed
`import(name)`, one assembled from variables, a template literal with a
substitution. Rare in library code, invisible here, and `ignore` is the escape
hatch. A module augmentation, `declare module 'pkg' { … }`, is not counted
either.

A lexer has to guess whether a `/` divides or opens a regular expression, and
the guesses are TypeScript-aware: `size()! / 2` divides, and a pattern after
`if (…)` is a pattern. What is left are shapes library code does not write — a
variable named `of` before a division, `{} / 2`, a pattern straight after
`for await (…)`, and a line of JSX text spelling a whole import. Any of them
can lose the imports after it, or read a later template's text as code.

Relative and absolute paths, subpath imports (`#internal`), anything with a
scheme (`node:fs`, `data:…`, a bundler's `virtual:…`), bare Node builtins, the
package's own name, and a specifier that cannot be a package name at all — a
path alias such as `@/x` or `~/x` — are all skipped. An alias that does look
like a package, such as a tsconfig `paths` entry `@app/*`, is read as one,
because `paths` is not read: list it in `ignore`.

## A scan that read nothing says so

When every file under `sourceDir` is excluded, or none is TypeScript, the
result is one sentence saying nothing was checked — not `[]`, which would be a
pass on a question nobody asked.

## Comments are stripped with a scanner, not a regular expression

Worth knowing because the obvious version is wrong, and wrong in a way that
reads as working. `/\/\*[\s\S]*?\*\//` finds a block comment inside the string
`"src/**/*.spec.ts"` — because `/**/` IS a block comment when nothing is
tracking that it sits between quotes. Reading a tsconfig that way turns the
exclusion list into `["src*.spec.ts", "srcfixtures/**"]`, which matches no file,
so the check reads every spec in the repository and reports the test runner as
an undeclared dependency.

The tsconfig reader here is a string-aware state machine, and it drops trailing
commas for the same reason it drops comments: a tsconfig is allowed them, and a
reader that is not is a reader that refuses real files.
