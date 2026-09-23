# unresolvableTypes

`ngtrue/node`

Every subpath whose **types** do not resolve, under each module-resolution mode,
as one sentence each. An empty array is a pass.

## A runnable example

```ts
import { unresolvableTypes } from 'ngtrue/node';

it('resolves its types the way a consumer will', async () => {
  expect(await unresolvableTypes({ packageDir: 'dist' })).toEqual([]);
});
```

Narrow it while iterating:

```ts
await unresolvableTypes({ packageDir: 'dist', modes: ['node16'] });
```

## How it answers

It runs **TypeScript's own resolver** — the same `ts.resolveModuleName` call
`tsc` and your editor make — against a throwaway directory with the package
symlinked into `node_modules`.

Nothing about the resolution is reimplemented, and that matters more here than
anywhere else in ngtrue. The rules are intricate: condition ORDER decides the
answer, `types` has to precede `import`, a missing `types` falls through to the
JavaScript without a word, and the whole thing differs per mode. An
approximation of that would agree with the real resolver on every package that
was already correct, which is the definition of a check that cannot fail.

Probing through a symlinked `node_modules` rather than through TypeScript's
self-reference support is deliberate too: a consumer resolves the package from
`node_modules`, and that is the layout whose answer matters.

## Both modes, because your consumers are not all you

`bundler` is forgiving in ways `node16` is not. A package checked only under the
mode its own repository happens to use will still break for half the people who
install it, and it will break at their `tsc`, not yours.

## Resolving to JavaScript is a finding

Louder than resolving to nothing, in fact. A subpath that resolves to a `.js`
with no declarations beside it hands the consumer `any`, with no error — the
package appears to work right up until something that should not have compiled
ships. The two are distinguished in the message because they have different
fixes.

## What it does not check

**Wildcard subpaths are skipped, and the skip is reported.** Each stands for an
open set and a single sample would say nothing about the rest. It appears in the
returned array so it cannot be mistaken for a pass.

**Only the conditions the package declares are probed.** An ESM-only package has
no `require` branch, and reporting one missing would be reporting a design
decision as a defect. Whether a package IS dual is a question about the
manifest, and [`unresolvedExports`](/guide/unresolved-exports) is where the
manifest is the subject.

**`typescript` must be installed.** It is an optional peer of ngtrue and this is
the only export that needs it. Any repository shipping a typed package has it;
one that somehow does not gets an error saying so, rather than a pass.
