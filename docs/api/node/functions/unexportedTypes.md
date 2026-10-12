[ngtrue](../../index.md) / [node](../index.md) / unexportedTypes

# Function: unexportedTypes()

> **unexportedTypes**(`options`): `Promise`\<readonly `string`[]\>

Defined in: [src/node/unexported-types.ts:199](https://github.com/thekhegay/ngtrue/blob/main/src/node/unexported-types.ts#L199)

Every public member whose type names a declaration that no subpath of the
package exports, as one sentence each. An empty array is a pass.

```ts
it('exports every type its public signatures name', async () => {
  expect(await unexportedTypes({ packageDir: 'dist' })).toEqual([]);
});
```

A finding reads
`ngwr/sidebar: WrSidebarItem.activeOptions names WrSidebarActiveOptions, which no subpath exports.`
— the consumer can bind that input and cannot write down its type. They
cannot annotate a field that holds it, so the field's type is inferred, and
in a library of their own TypeScript then has to print it into a `.d.ts` and
fails with TS2883 under pnpm, where the only path to the declaration is
inside the virtual store. TypeScript itself never reports any of this on the
package that causes it: a declaration file naming a type it does not export
is perfectly valid, and the error lands in somebody else's build.

## Provenance

In ngwr it happened twice before this existed.
[39b2f4ac](https://github.com/thekhegay/ngwr/commit/39b2f4ac) re-exported
`WrButtonShape`, which `WrButton`'s `shape` input had been typed with while
the entry point never exported it.
[c4f4c94c](https://github.com/thekhegay/ngwr/commit/c4f4c94c) did the same
for five more — `WrAvatarShape`, `WrBadgeShape`, `WrDividerAlign`,
`WrPaginationSize` and `WrPaginationShape`, across four entry points —
riding along in a commit about stylesheets, because nothing had been
looking. Run over ngwr 14.11.0's build, this found two that were still live:
`WrSidebarItem.activeOptions` and `WrSelect.registerOption`. Outside it,
[telerik/kendo-angular#4982](https://github.com/telerik/kendo-angular/issues/4982)
(`PopupSettings.collision` typed with a `Collision` the package did not
export) and
[storybookjs/storybook#27425](https://github.com/storybookjs/storybook/issues/27425)
(`TransformComponentType`, not importable from `@storybook/angular`) are the
same question filed by consumers who hit it.

## How it answers

Every literal subpath is imported from a throwaway package that has this one
symlinked into `node_modules` — the probe `unresolvableTypes` uses — and the
whole set goes into ONE TypeScript program, so the checker resolves each
import exactly as a consumer's compiler would, through `exports`, to the
bundled declaration file they actually get. What every subpath exports is
then unioned before anything is judged. That union is the reason this is not
API Extractor's `ae-forgotten-export`, which asks the same question one
entry point at a time and so reports a type that a SIBLING subpath exports —
in a library with two hundred entry points, nearly every shared type.

For each exported class, interface, type alias, function and variable, it
reads the types written in its public signatures — members, parameters,
return types, type arguments, `typeof` queries, `import('…')` types,
`extends` clauses — and asks the checker what each name resolves to. A name
is a finding when it resolves to a declaration inside this package that no
subpath exports. A name that resolves into `node_modules` is someone else's
surface and is not judged, and one declared globally (`declare global`, a
script file, an ambient `declare module`) needs no export to be named.

A name that resolves to NOTHING is a finding too, when the package's own
specifier brought it in — a relative one, or the package's own name: `import
{ BtnShape } from './types.js'` where the build stopped emitting
`types.d.ts`, or emitted a stale one without `BtnShape` in it. The checker
gives such a name the error type, which a consumer under `skipLibCheck` reads
as `any` without a word, and without it reads as an error in a file they did
not write. Skipping it would answer exactly as for the package that shipped
the file, and no other check here would notice: the subpath itself resolves.
`ignore` does not reach these, since a missing declaration is never a
decision. A name that does not resolve and came from anywhere else — a
dependency that is not installed, a global from an `@types` package the
program cannot see — is skipped, because nothing from a dependency is judged
whether it resolves or not.

Skipped, each because a consumer is not promised it or never meets it:
`private` and `#private` members; `protected` members, which in an Angular
library are template state far more often than an extension point (ngwr's
`protected readonly resolvedShape`); members and declarations tagged
`@internal`; names starting with `ɵ`, which is Angular's own marker for
private API and covers every `ɵcmp` and `ɵfac` the compiler emits;
`implements` clauses, since a class re-declares every member an interface
promises and the interface's name is never needed to use it; and the operand
of `keyof`, whose result is a union of literal keys with no name left in it.
A type exported under an alias whose whole body is a bare reference —
`export type A = B` — makes `B` nameable as `A`, and is counted that way.

A finding about a declaration tagged `@internal` says so, because there the
usual fix is the other way round: the member naming it is the one that
escaped, and it wants the tag too. An `extends` clause naming an `@internal`
base is not a finding at all — a public subclass of a private base is an
ordinary shape, and the tag already records the decision.

## What it does not check

**Whether a type is MEANT to be unnameable.** A brand type, or a base class
kept private on purpose without an `@internal` tag, is reported like an
oversight, because the declaration file says the same thing in both cases.
That is what `ignore` is for, and the entry it takes is the record of the
decision.

**Types the compiler inlined.** Where a type was inferred and the compiler
wrote out its structure instead of a name — `Signal<{ open: boolean }>`
rather than `Signal<PanelState>` — there is nothing to resolve. Only names
that appear in the declaration files are read, so an unexported type that
reached them only as structure is invisible here.

**A type that only a DEPENDENCY exports** (the kendo case: the declaration is
exported by `@progress/kendo-angular-popup`, and the tooltip package that
names it does not re-export it). Declarations in `node_modules` are skipped
entirely; whether a dependency's type should be re-exported is a judgement
about which packages a consumer is expected to install, and the declaration
files cannot settle it.

**Members inherited from a base that is not exported.** The `extends` clause
itself is reported, unless the base is `@internal`; either way the base's own
members are read only once it is exported and becomes a subject in its own
right, so a public member a subclass inherits from a private base is not
read at all. A mixin base, which `tsc` writes as a `declare const Btn_base`
beside the class, is the same case under a generated name: `Btn extends
Btn_base` is reported, and nothing in that constant's annotation is read.

**Protected members, for a library that means them.** Where a `protected`
member is an extension point, a subclass in the consumer's code does meet its
types, and an unexported one there goes unreported.

**A declaration `stripInternal` removed while a public member still names
it.** In a bundled declaration file the name is then local and declared
nowhere, which is indistinguishable here from a global the program cannot
see — `NodeJS.Timeout` with no `@types/node` installed, since TypeScript
stopped writing `/// <reference types>` for those in 5.5 — so it is skipped
rather than reported. Where the stripped declaration sat in a separate file
and was imported, it is caught as a name that does not resolve.

**Wildcard subpaths.** Each stands for an open set, so its exports are not
counted, and a type exported ONLY through one would be reported as exported
by no subpath. The wildcard is reported alongside, so that reading cannot be
mistaken for a clean one.

**Any resolution mode but `bundler`.** That is the one an Angular
application compiles under. Whether a subpath resolves at all, and the same
under `node16`, is `unresolvableTypes`'s question; a subpath that does not
load here is reported rather than read, because its exports going uncounted
would turn into findings against every type it exports.

Subpaths that are not code — a `sass` or `style` condition, a `.json` or
`.scss` target — are left out without a word: no import of them can carry a
type, so there is nothing to read or to count.

A run that read nothing says so rather than returning an empty array: a
package whose every subpath is a stylesheet, a wildcard or a file that does
not load, and one whose subpaths load but export nothing of its own to read.
That holds when `ignore` acknowledged every one of those subpaths, too —
acknowledging a subpath excuses the line about it, and does not turn
"nothing was read" into "nothing was wrong".

`typescript` has to be installed. It is an optional peer of ngtrue, and this,
`unresolvableTypes` and `globalAttributeInputs` are the three functions that
load it; without it this throws rather than passing.

## Parameters

### options

[`UnexportedTypesOptions`](../interfaces/UnexportedTypesOptions.md)

## Returns

`Promise`\<readonly `string`[]\>

## Since

0.2.0
