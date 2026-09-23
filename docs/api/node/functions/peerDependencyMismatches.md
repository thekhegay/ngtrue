[ngtrue](../../index.md) / [node](../index.md) / peerDependencyMismatches

# Function: peerDependencyMismatches()

> **peerDependencyMismatches**(`options`): readonly `string`[]

Defined in: [src/node/peer-dependency-mismatches.ts:87](https://github.com/thekhegay/ngtrue/blob/main/src/node/peer-dependency-mismatches.ts#L87)

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

By reading the source text with comments stripped, not by parsing: this runs
against `.ts` that may use syntax the running TypeScript does not know yet,
and a scanner that throws on a file is worse than one that is approximate.
`from '…'`, bare `import '…'`, `import('…')` and `require('…')` are all
matched.

What that cannot see is a specifier that is not a literal — a computed
`import(name)`, or one assembled from variables. Those are rare in library
code and invisible here, so a package reached only that way has to be added
by hand or listed in `ignore`.

Relative paths, `node:` specifiers, bare Node builtins, subpath imports
(`#internal`) and the package's own name are all skipped.

## Parameters

### options

[`PeerDependencyMismatchesOptions`](../interfaces/PeerDependencyMismatchesOptions.md)

## Returns

readonly `string`[]

## Since

0.1.0
