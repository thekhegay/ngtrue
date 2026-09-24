# ngtrue

Checks that keep an Angular library true.

[![ngtrue docs](https://img.shields.io/badge/ngtrue.khegay.dev-3451b2)](https://ngtrue.khegay.dev)
[![npm version](https://img.shields.io/npm/v/ngtrue?color=e21a62)](https://www.npmjs.com/package/ngtrue)
[![ci](https://img.shields.io/github/actions/workflow/status/thekhegay/ngtrue/ci.yml?branch=main&label=ci)](https://github.com/thekhegay/ngtrue/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/ngtrue)](https://www.npmjs.com/package/ngtrue)
[![license](https://img.shields.io/npm/l/ngtrue)](https://github.com/thekhegay/ngtrue/blob/main/LICENSE)

To true something is to bring it into exact alignment — a wheel, a door, a
frame. That is the brief: every export takes one claim a library makes and holds
it against what the library actually does.

[Documentation](https://ngtrue.khegay.dev) · [The three entry points](https://ngtrue.khegay.dev/entry-points) · [API reference](https://ngtrue.khegay.dev/api/) · [Deprecation policy](https://ngtrue.khegay.dev/deprecation-policy)

## Who it is for

People who **ship** Angular libraries. Not application developers. The questions
here are the ones you only have when other people install your code:

- Is this control really wired to Signal Forms, or does it only look wired?
- Does the manifest describe the files the build actually produced?
- Will the types resolve for a consumer whose `tsconfig.json` is not yours?

## Install

```sh
npm install --save-dev ngtrue
```

Always a dev dependency. `@angular/core`, `@angular/forms` and `typescript` are
optional peers — each is needed by one entry point, and the entry point that
does not need them works without them.

## Three entry points

Split by the environment the code runs in, the same way `@angular/core` and
`@angular/core/testing` are split.

| Subpath          | Runs in                   | Holds                              |
| ---------------- | ------------------------- | ---------------------------------- |
| `ngtrue`         | an application, in theory | nothing yet, on purpose            |
| `ngtrue/testing` | a test run                | the Signal Forms conformance suite |
| `ngtrue/node`    | a build or a script       | the packaging checks               |

**No export may import another export.** That is the mistake that made lodash
untreeshakable, and here it would also drag `@angular/core/testing` or `node:fs`
onto a path an application build can follow. It is enforced by a test, not by
convention.

## `ngtrue/testing`

```ts
import { assertSignalFormsControl } from 'ngtrue/testing';

it('is a conforming Signal Forms control', async () => {
  await assertSignalFormsControl(() => TestBed.createComponent(Host));
});
```

One assertion, eight rules, and a failure that names the rule that broke rather
than the line that noticed. It is stricter than `FormValueControl` deliberately:
Angular makes `disabled`, `readonly` and `touch` optional, and a control that
omits them binds and renders while the schema rules that reach for them
evaporate in silence.

## `ngtrue/node`

```ts
import { peerDependencyMismatches, unresolvableTypes, unresolvedExports } from 'ngtrue/node';

it('ships every file it advertises', () => {
  expect(unresolvedExports({ packageDir: 'dist' })).toEqual([]);
});

it('resolves its types the way a consumer will', async () => {
  expect(await unresolvableTypes({ packageDir: 'dist' })).toEqual([]);
});

it('declares what it imports, and imports what it declares', () => {
  expect(peerDependencyMismatches({ packageDir: '.', tsconfig: 'tsconfig.build.json' })).toEqual([]);
});
```

Each returns the problems it found, so the runner prints the offending subpath
rather than "expected true to be false".

## What it will not do

Every export states what it cannot check, next to what it can. A check that
would answer the same for a working library and a broken one is worse than no
check: it turns an unasked question into an answered one, and the answer is
always yes. Where a rule cannot be verified honestly, ngtrue says so and leaves
it to a reviewer.

## Licence

MIT © Roman Khegay
