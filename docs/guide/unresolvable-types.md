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

**A subpath only a stylesheet compiler can reach is skipped, silently.** When
every target sits under a stylesheet condition — `sass`, `style`, `less`, `css`,
`scss` or `stylus` — TypeScript matches none of them and there is no types
question to ask:

```json
{
  "exports": {
    "./theme": { "sass": "./theme/_index.scss" },
    "./overlay-prebuilt.css": { "style": "./overlay-prebuilt.css" },
    "./*.less": { "less": "./*.less" },
    "./split.css": { "css": "./split.css" }
  }
}
```

It is the same set [`unexportedTypes`](/guide/unexported-types) leaves out, so
the two checks agree about which subpaths are stylesheets. They did not always:
with only `sass` and `style` skipped here, ng-zorro-antd's `less` wildcards
were reported as unprobed and angular-split's `css` theme as unresolvable,
while `unexportedTypes` passed over both.

The skip goes by condition, not by file extension. A subpath with any other
target is probed like the rest, so `{ "sass": "./_theme.scss", "default":
"./theme.js" }` with no `types` is reported under both modes — a TypeScript
import lands on that `.js`. So is a bare string pointing at a `.css` file, which
offers the file to every condition, TypeScript's included. A subpath blocked
with `null` is not probed: blocking it is the point.

What the skip cannot tell is intent. A subpath meant for TypeScript as well —
`{ "sass": …, "types": …, "default": … }` — that loses its `types` and
`default` to a manifest generator reads exactly like a stylesheet entry, and is
skipped. `unresolvedExports` does not catch it either, because the stylesheet
it still names exists. Only a test that knows your list of entry points can
ask whether each one is still there.

**Only the conditions the package declares are probed.** An ESM-only package has
no `require` branch, and reporting one missing would be reporting a design
decision as a defect. Whether a package IS dual is a question about the
manifest, and [`unresolvedExports`](/guide/unresolved-exports) is where the
manifest is the subject.

**A probe of nothing is reported.** A package whose every subpath is a
wildcard, a stylesheet, `null` or `./package.json` — or that has no `exports`
at all — gets one sentence saying nothing was checked, rather than an empty
array that reads as "its types resolve". Without `exports`, every file in a
package is importable, so probing the root alone would be one sample of an open
set, the same reason a wildcard is not probed.

**`typescript` must be installed.** It is an optional peer of ngtrue, needed by
this export, by [`unexportedTypes`](/guide/unexported-types) and by
[`globalAttributeInputs`](/guide/global-attribute-inputs). Any repository
shipping a typed package has it; one that somehow does not gets an error saying
so, rather than a pass.
