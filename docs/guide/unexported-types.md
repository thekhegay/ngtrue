# unexportedTypes

`ngtrue/node`

Every public member whose type names a declaration that **no subpath of the
package exports**, as one sentence each. An empty array is a pass.

## A runnable example

```ts
import { unexportedTypes } from 'ngtrue/node';

it('exports every type its public signatures name', async () => {
  expect(await unexportedTypes({ packageDir: 'dist' })).toEqual([]);
});
```

Point it at the built package, the directory that would be packed. A finding
reads like this:

```text
ngwr/sidebar: WrSidebarItem.activeOptions names WrSidebarActiveOptions, which no subpath exports.
```

## Why it matters

The consumer can bind that input and cannot write down its type. They cannot
annotate a field that holds the value, so the field's type is inferred — and in
a library of their own, TypeScript then has to print that type into a `.d.ts`.
Under pnpm the only path to the declaration is inside the virtual store, so the
build fails with TS2883. TypeScript never reports any of this on the package
that causes it: a declaration file naming a type it does not export is valid,
and the error lands in somebody else's build.

It is easy to ship. A type declared in `types/` and never re-exported by
`public-api.ts` compiles, renders and passes every test the library has.

## One program, every subpath

Every literal subpath is imported from a throwaway package that has yours
symlinked into `node_modules`, and the whole set goes into one TypeScript
program. The checker resolves each import as a consumer's compiler would,
through `exports`, to the declaration file they actually get.

What all the subpaths export is unioned **before** anything is judged. A type
used by `your-lib/select` and exported by `your-lib/types` is fine, and a check
that looked at one entry point at a time would report it anyway.

## What counts, and what is skipped

Read: the types in each exported declaration's public signatures — members,
parameters, return types, type arguments, `typeof` queries, `import('…')`
types and `extends` clauses.

A name that resolves to **nothing** is reported too, when your own package
brought it in — a relative import, or one by your package's name. That is a
declaration file the build stopped emitting, or emitted stale:

```text
your-lib: Btn.shape names BtnShape, which does not resolve — './types.js' leads to no declaration file.
```

The subpath itself still resolves, so nothing else notices, and a consumer
under `skipLibCheck` gets `any` in its place without a word. `ignore` does not
reach these: a missing file is never a decision.

Skipped, because a consumer is not promised them or never meets them:

- `private` and `#private` members
- `protected` members, which in an Angular library are template state far more
  often than an extension point
- members and declarations tagged `@internal`
- names starting with `ɵ`, which covers every `ɵcmp` and `ɵfac` Angular emits
- `implements` clauses
- the operand of `keyof`, whose result is a union of keys
- names that resolve into `node_modules`, or that are declared globally

When the unexported type is tagged `@internal`, the finding says so. The usual
fix there is to tag the member that names it as well, not to export the type.
An `extends` clause naming an `@internal` base is not reported: a public
subclass of a private base is an ordinary shape, and the tag is the decision.

## Exempting a decision

Some types are meant to stay unnameable — a brand, a base class you do not want
subclassed from outside. Pass their names, exactly as the finding prints them:

```ts
await unexportedTypes({ packageDir: 'dist', ignore: ['ControlBase'] });
```

A subpath, spelled as it is in `exports`, acknowledges one that cannot be read:

```ts
await unexportedTypes({ packageDir: 'dist', ignore: ['./schematics/*'] });
```

An entry that exempts nothing is reported, so the list cannot outlive what it
excused.

Acknowledging a subpath excuses the line about it and nothing else. When no
subpath could be read at all, the run says so even if every one of them is
listed, because an empty array would claim that every signature checked out.

## What it does not check

**Whether a type is meant to be unnameable.** The declaration file looks the
same either way, so an intentional one is reported like an oversight until it
is listed in `ignore`.

**Types the compiler wrote out as structure.** An inferred type printed as
`{ open: boolean }` rather than by name has nothing to resolve.

**Types only a dependency exports.** Declarations in `node_modules` are not
judged. Whether a dependency's type should be re-exported depends on which
packages your consumers are expected to install.

**Members inherited from an unexported base.** The base's own members are read
only once it is exported, so a public member a subclass inherits from a private
base is not read at all. A mixin base, which `tsc` writes as
`declare const Btn_base` beside the class, is reported by that generated name,
and nothing in its annotation is read.

**Protected members you mean as an extension point.** A subclass in the
consumer's code meets their types, and an unexported one there goes
unreported.

**A declaration `stripInternal` removed while a public member still names it.**
In a bundled declaration file the name is then local and declared nowhere,
which looks exactly like a global from an `@types` package that is not
installed, so it is skipped. If the stripped declaration sat in its own file and
was imported, it is reported as a name that does not resolve.

**Wildcard subpaths.** Their exports cannot be counted, so a type exported only
through one would be reported. The wildcard is reported too, so the result
cannot be mistaken for a clean one.

**Resolution modes other than `bundler`**, the one Angular applications use. A
subpath that does not load is reported rather than read; why it does not load
is [`unresolvableTypes`](/guide/unresolvable-types)'s question.

Subpaths that are not code — a `sass` or `style` condition, a `.json` target —
are left out, since no import of them can carry a type.

**`typescript` must be installed.** It is an optional peer of ngtrue, needed by
this export, by [`unresolvableTypes`](/guide/unresolvable-types) and by
[`globalAttributeInputs`](/guide/global-attribute-inputs); without it this
throws rather than passing.
