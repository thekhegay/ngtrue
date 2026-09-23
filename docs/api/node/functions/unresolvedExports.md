[ngtrue](../../index.md) / [node](../index.md) / unresolvedExports

# Function: unresolvedExports()

> **unresolvedExports**(`options`): readonly `string`[]

Defined in: src/node/unresolved-exports.ts:53

Every subpath in `exports` that does not resolve to a file on disk, as one
sentence each. An empty array is a pass.

```ts
it('ships every file it advertises', () => {
  expect(unresolvedExports({ packageDir: 'dist' })).toEqual([]);
});
```

Node reads `exports` as the package's whole public surface: a subpath that is
not listed cannot be imported at all, and one that IS listed and points at
nothing fails at the consumer's import with `ERR_MODULE_NOT_FOUND`. Nothing
in a normal build catches the second case — the manifest is data, the build
writes files, and no step compares them — so it surfaces after publishing,
in someone else's install.

Every condition is followed, not just the one this process would pick. A
`require` branch left pointing at a file a later build stopped emitting is
invisible to a test suite that only ever imports, and to every developer on
the team who only ever imports.

A subpath containing `*` is checked by expansion: the pattern must match at
least one real file. That is weaker than the literal case on purpose — a
pattern stands for an open set, and the only thing that can be said about it
from the filesystem is whether the set is empty. An empty one is a dead
subpath and is reported; a pattern that matches a hundred files and misses
the one a consumer wants cannot be seen from here.

What it does not check: that a resolved file is loadable. A `.js` that
imports a missing sibling resolves perfectly and still throws on import.
Resolution is a question about the manifest, and that is a question about the
build.

## Parameters

### options

[`UnresolvedExportsOptions`](../interfaces/UnresolvedExportsOptions.md)

## Returns

readonly `string`[]
