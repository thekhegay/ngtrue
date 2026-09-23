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

Prefer `tsconfig` to a hand-written `exclude`. The compiler already knows which
files are left out of the package; restating it here gives you two lists that
agree until somebody adds a third kind of test file to one of them.

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

By reading the source text with comments stripped, rather than by parsing. This
runs against `.ts` that may use syntax the installed TypeScript does not know
yet, and a scanner that throws on one file is worse than one that is
approximate. `from '…'`, bare `import '…'`, `import('…')` and `require('…')` are
all matched.

What it cannot see is a specifier that is not a literal — a computed
`import(name)`, or one assembled from variables. Rare in library code, invisible
here, and `ignore` is the escape hatch.

Relative paths, `node:` specifiers, bare Node builtins, subpath imports
(`#internal`) and the package's own name are all skipped.

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
