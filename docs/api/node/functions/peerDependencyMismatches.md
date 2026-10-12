[ngtrue](../../index.md) / [node](../index.md) / peerDependencyMismatches

# Function: peerDependencyMismatches()

> **peerDependencyMismatches**(`options`): readonly `string`[]

Defined in: [src/node/peer-dependency-mismatches.ts:147](https://github.com/thekhegay/ngtrue/blob/main/src/node/peer-dependency-mismatches.ts#L147)

Every package a shipped source imports and the manifest does not declare, and
every dependency the manifest declares and no shipped source imports, as one
sentence each. An empty array is a pass.

```ts
it('declares what it imports, and imports what it declares', () => {
  expect(peerDependencyMismatches({ packageDir: '.', tsconfig: 'tsconfig.build.json' })).toEqual([]);
});
```

## Why both directions

**Undeclared** is the one that breaks an install. A bundler resolves whatever
is in the workspace's `node_modules`, so an import of a package nobody
declared builds green and ships, and the failure lands in a consumer's app as
`ERR_MODULE_NOT_FOUND` — but only in an app that does not happen to have the
package already. Every framework app has the framework's own packages, which
is exactly why they are the ones that go undeclared for years.

**Declared and never imported** is quieter and still wrong. A peer range is
not a hint, it is a resolvable constraint: npm installs optional peers when
they are present and errors on a conflict, so a range on a package the
library never loads can fail somebody's install over code that does not run.
The usual culprit is a package that used to be imported, and the one after
that is a package whose data is passed IN as an argument rather than
imported — an icon set, a date library behind an adapter — which feels like a
dependency and is not one.

## How imports are found, and what that misses

By lexing the source rather than parsing it. Comments, string literals,
template text and regular expressions are blanked first, and a string literal
counts only when the CODE in front of it is `from`, a bare `import`, or
`import(` / `require(` with the literal as the whole first argument —
`require` only as a bare identifier, since `this.require('a')` is somebody's
method. Not a parser, because this runs against `.ts` that may use syntax the
installed TypeScript does not know yet and a scanner that throws on a file is
worse than one that is approximate; and not the scanner the compiler offers
for this, `ts.preProcessFile`, which reports `this.require('a')` as an import.

The first version matched the raw text with comments stripped, and on ngwr's
`projects/lib` ten of its eleven findings were wrong. Eight were TEXT: a
template literal printing `from "${edge.from}"`, schematics writing
`` `import { ${symbol} } from '${subpath}';` `` into a consumer's file, a
`getAttribute('data-from'), getAttribute('data-to')` whose quotes paired
across the comma, and a harness method named `require`. The other two were
the Angular CLI's own packages, which is what `exclude` beside `tsconfig` is
for. The eleventh — `tslib` declared and imported by nothing, in the source
or in the built output — was true, and is still reported.

What it cannot see is a specifier that is not a literal — a computed
`import(name)`, `require(base + '/x')`, a template literal with a
substitution. Those are rare in library code and invisible here, so a package
reached only that way has to be added by hand or listed in `ignore`. Nor does
it know which imports a build keeps: an import used only as a type still
counts, though it is erased from the JavaScript, and whether the declarations
a consumer installs still name that package depends on whether the type
reaches the public surface — which this does not look at. A module
augmentation, `declare module 'pkg' { … }`, is not counted either.

A lexer has to guess whether a `/` divides or opens a regular expression,
and a wrong guess is not always local: through a template literal it can
lose the imports after it and read a later template's text as code. The
guesses are TypeScript-aware — `size()! / 2` divides, a pattern after
`if (…)` is a pattern — and what is left are shapes library code does not
write: a variable named `of` before a division, `{} / 2`, a pattern straight
after `for await (…)`, and a line of JSX text spelling a whole import.

Skipped: relative and absolute paths, subpath imports (`#internal`), anything
with a scheme (`node:fs`, `data:…`, a bundler's `virtual:…`), bare Node
builtins, the package's own name, and a specifier that cannot be a package
name at all — whitespace, quotes, `${`, a path alias such as `@/x` or `~/x`.
That last filter is ngwr's (faf216cd) and stays behind the lexer on purpose:
text the lexer ever takes for code has to spell a plausible package name to
reach a finding, which `${edge.from}` and `), path.getAttribute(` never do.
An alias that does look like a package — a tsconfig `paths` entry such as
`@app/*` — is read as one, because `paths` is not read; list it in `ignore`.

## A scan that read nothing is a finding

When every file under `sourceDir` is excluded, or none is TypeScript, the
answer is one sentence saying so and nothing else. An empty source set would
otherwise return `[]` for a package that declares nothing — a pass on a
question that was never asked — or report every declared dependency as
unused, which blames the manifest for the configuration.

## Parameters

### options

[`PeerDependencyMismatchesOptions`](../interfaces/PeerDependencyMismatchesOptions.md)

## Returns

readonly `string`[]

## Since

0.1.0
