[ngtrue](../../index.md) / [node](../index.md) / unresolvableTypes

# Function: unresolvableTypes()

> **unresolvableTypes**(`options`): `Promise`\<readonly `string`[]\>

Defined in: src/node/unresolvable-types.ts:67

Every subpath whose TYPES do not resolve, under each mode, as one sentence
each. An empty array is a pass.

```ts
it('resolves its types the way a consumer will', async () => {
  expect(await unresolvableTypes({ packageDir: 'dist' })).toEqual([]);
});
```

This runs TypeScript's own resolver — the same call `tsc` and the editor
make — against a throwaway directory with the package symlinked into
`node_modules`. Nothing about the resolution is reimplemented, which matters
more here than anywhere else in ngtrue: the rules are intricate (condition
ORDER decides the answer, `types` must precede `import`, a missing `types`
silently falls through to the JavaScript), they differ per mode, and a
hand-rolled approximation of them would agree with the real thing on every
package that was already correct.

Probing through a symlinked `node_modules` rather than through TypeScript's
self-reference support is deliberate too: a consumer resolves the package
from `node_modules`, and that is the layout whose answer matters.

A subpath that resolves to JavaScript is reported as loudly as one that
resolves to nothing. It is the worse of the two — a consumer gets `any`, no
error, and the package appears to work until something that should not have
compiled ships.

## What it does not check

**Wildcard subpaths are skipped**, and the skip is reported so it cannot pass
for a pass. Each one stands for an open set, and a single sample would say
nothing about the rest of it.

**Only the conditions this package actually declares are probed.** An
ESM-only package has no `require` branch, and reporting one missing would be
reporting a design decision as a defect. If a package means to be dual, the
check that it IS dual belongs in `unresolvedExports`, where the manifest is
the subject.

**`typescript` has to be installed.** It is an optional peer dependency of
ngtrue, and this is the only function that needs it. Any repository shipping
a typed package has it already; one that somehow does not gets an error
saying so rather than a pass.

## Parameters

### options

[`UnresolvableTypesOptions`](../interfaces/UnresolvableTypesOptions.md)

## Returns

`Promise`\<readonly `string`[]\>
