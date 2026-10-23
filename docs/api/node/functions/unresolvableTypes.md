[ngtrue](../../index.md) / [node](../index.md) / unresolvableTypes

# Function: unresolvableTypes()

> **unresolvableTypes**(`options`): `Promise`\<readonly `string`[]\>

Defined in: [src/node/unresolvable-types.ts:139](https://github.com/thekhegay/ngtrue/blob/main/src/node/unresolvable-types.ts#L139)

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
nothing about the rest of it. One that no TypeScript import is meant to
reach is acknowledged in `ignore`.

**A subpath only a stylesheet tool can reach is not probed.** When every
target sits under a stylesheet condition — `sass`, `style`, `less`, `css`,
`scss` or `stylus`, the set `unexportedTypes` leaves out as well — TypeScript
matches none of them, and the resolver answers "does not resolve" for a
subpath that was never meant for it. ngwr's
`"./theme": { "sass": "./theme/_index.scss", … }` family and the CDK's
`"./overlay-prebuilt.css": { "style": "./overlay-prebuilt.css" }` were ten of
the twelve lines this returned on ngwr's built package and all twelve on
`@angular/cdk`. With only those two conditions skipped, ng-zorro-antd 22.1.2
still got 69 lines, every one a wildcard only `less` and `style` reach —
`"./*.less": { "less": "./*.less" }` and one per component — and
angular-split 20.0.0 got two, both for `"./theme": { "css": "./theme.css" }`.
The same question reached arethetypeswrong from outside
(arethetypeswrong/arethetypeswrong.github.io#183, and #30 asks to ignore an
entry), which offers `--exclude-entrypoints` for it; here the manifest
already says which subpaths are stylesheets, whenever it says so with a
condition, and `ignore` takes the rest. A target of `null` counts as
unreachable for the same reason — blocking a subpath is the point of writing
one.

What the skip cannot tell is intent. A subpath that is MEANT for TypeScript
as well — ngwr's `./theme` carries `types` and `default` beside its `sass` —
and loses those two conditions to a manifest generator reads exactly like a
stylesheet entry, so it is skipped and nothing here reports it;
`unresolvedExports` does not either, since the stylesheet it still names
exists. Whether every TypeScript entry point is still in `exports` is a
question about the list, and only a test that knows the list can ask it.

The skip goes by condition and not by file extension, so a subpath with any
other target is probed like the rest. `{ "sass": …, "default": "./theme.js" }`
with no `types` is reported under both modes, because a TypeScript import
does land on that `.js`. A bare string pointing at a `.css` file — the shape
in #183 — is probed too: it offers the file to every condition, TypeScript's
included, and what a TypeScript import of it gets is the question this check
answers. A package that keeps that shape on purpose says so in `ignore`,
where the decision is written down rather than guessed from the extension.

**Only the conditions this package actually declares are probed.** An
ESM-only package has no `require` branch, and reporting one missing would be
reporting a design decision as a defect. If a package means to be dual, the
check that it IS dual belongs in `unresolvedExports`, where the manifest is
the subject.

**A probe of nothing is reported, not passed.** A package whose every subpath
is a wildcard, a stylesheet, `null` or `./package.json` — or that has no
`exports` at all — gets one sentence saying nothing was checked, rather than
an empty array that reads as "its types resolve". A package without `exports`
is not probed through `types` and `main` instead: without a map every file
in it is importable, so the root alone would be one sample of an open set —
the reason a wildcard is not probed either. Nor does `ignore` turn a run in
which nothing resolved into a pass: when every subpath that was probed is
listed there and none of them resolved, that is said too, since excusing a
finding is not the same as having checked something.

**`typescript` has to be installed.** It is an optional peer dependency of
ngtrue, needed by this function, by `unexportedTypes` and by
`globalAttributeInputs`, and by nothing else. Any repository shipping a typed
package has it already; one that somehow does not gets an error saying so
rather than a pass.

## Parameters

### options

[`UnresolvableTypesOptions`](../interfaces/UnresolvableTypesOptions.md)

## Returns

`Promise`\<readonly `string`[]\>

## Since

0.1.0
