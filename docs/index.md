# ngtrue

To true something is to bring it into exact alignment — a wheel, a door, a
frame. That is the whole brief: every export here takes one claim an Angular
library makes and checks it against what the library actually does.

## Who it is for

People who **ship** Angular libraries. Not application developers — that
distinction is the spine of the package rather than a marketing line, and it is
what stops it drifting into a bag of utilities. The questions ngtrue answers are
questions you only have when other people install your code:

- Is this control really wired to Signal Forms, or does it only look wired?
- Does the manifest describe the files the build actually produced?
- Will the types resolve for a consumer whose `tsconfig.json` is not yours?

Anything an application developer would reach for belongs somewhere else. There
are already good answers to most of those, and none of them know what an entry
point is.

## The shape

One package, three entry points, split by the environment the code runs in —
the same split `@angular/core` and `@angular/core/testing` make, for the same
reason. [The three entry points](/entry-points) explains it, including the one
rule the package is built around: **no export may import another export.**

```ts
import { assertSignalFormsControl } from 'ngtrue/testing';
import { peerDependencyMismatches, unresolvableTypes, unresolvedExports } from 'ngtrue/node';
```

## What is here today

| Export                                                           | Entry point      | Answers                                                      |
| ---------------------------------------------------------------- | ---------------- | ------------------------------------------------------------ |
| [`assertSignalFormsControl`](/guide/assert-signal-forms-control) | `ngtrue/testing` | Is this custom control correctly wired to Signal Forms?      |
| [`unresolvedExports`](/guide/unresolved-exports)                 | `ngtrue/node`    | Does every advertised subpath resolve to a file that exists? |
| [`unresolvableTypes`](/guide/unresolvable-types)                 | `ngtrue/node`    | Do the types resolve under node16 and under bundler?         |
| [`peerDependencyMismatches`](/guide/peer-dependency-mismatches)  | `ngtrue/node`    | Does the manifest match what the source imports, both ways?  |

The root entry point is empty. That is deliberate and is explained where it
would otherwise look like an oversight.

## Installing

```sh
npm install --save-dev ngtrue
```

A dev dependency, always: nothing here belongs in a shipped bundle.
`@angular/core` and `@angular/forms` are optional peers — `ngtrue/testing` needs
them and `ngtrue/node` does not. So is `typescript`, which one function uses to
run the real module resolver rather than an imitation of it.

## What it will not do

Every export states what it cannot check, in its own documentation, next to what
it can. That is not modesty. A check that would answer the same for a working
library and a broken one is worse than no check, because it converts an unasked
question into an answered one — and the answer is always yes. Where a rule
cannot be verified honestly, ngtrue says so and leaves it to a reviewer, rather
than shipping something that passes.
