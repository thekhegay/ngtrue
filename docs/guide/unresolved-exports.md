# unresolvedExports

`ngtrue/node`

Every subpath in `exports` that does not resolve to a file on disk, as one
sentence each. An empty array is a pass.

## A runnable example

```ts
import { unresolvedExports } from 'ngtrue/node';

it('ships every file it advertises', () => {
  expect(unresolvedExports({ packageDir: 'dist' })).toEqual([]);
});
```

Point it at the **built** package — the directory that would be packed. An
`exports` map describing `./dist/...` resolves perfectly well against the
repository root and says nothing at all about what npm shipped.

Returning the problems rather than throwing is what makes the failure readable:
the test runner prints the array, so the report is the offending subpath instead
of "expected true to be false".

## Why this goes wrong quietly

Node reads `exports` as the package's entire public surface. A subpath that is
not listed cannot be imported; one that IS listed and points at nothing fails at
the consumer's import with `ERR_MODULE_NOT_FOUND`.

Nothing in a normal build compares the two. The manifest is hand-written data,
the build writes files, and no step holds one against the other — so the first
person to find out is someone who installed the package.

## Every condition, not the live one

The walk follows all three shapes Node allows — a bare string, a conditions
object, a fallback array — and reports each reachable target.

That matters most for the branch your own tests never take. A `require` target
left pointing at a file a later build stopped emitting is invisible to a suite
that only ever imports, and to everyone on the team who only ever imports. So is
a `types` target, which nothing at runtime touches at all.

A target of `null` is skipped: that is how a subpath is blocked on purpose.

## What it reports

- a target that does not exist
- a target that is a directory, which Node will not resolve
- a target that does not start with `./`, which Node rejects outright
- a `*` in a target whose subpath has none, so it can never expand
- more than one `*` in a target, where Node expands only the first
- a wildcard subpath that matches no file at all
- no `exports` map at all — see below

## What it does not check

**A wildcard is only checked for emptiness.** A pattern stands for an open set,
and the one thing the filesystem can settle about it is whether the set is
empty. An empty one is a dead subpath. A pattern matching a hundred files that
misses the one a consumer wants cannot be seen from here.

**It does not check that a resolved file loads.** A `.js` importing a missing
sibling resolves perfectly and throws on import. Resolution is a question about
the manifest; loading is a question about the build.

**A package with no `exports` gets a finding, not a pass.** An empty array there
would be true and useless — with no map, every file in the package is
importable, including ones nobody meant to publish. Silence would be the right
answer to a question nobody asked.
