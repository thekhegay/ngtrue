# angularPeerFloorsTooLow

`ngtrue/node`

Every way the `@angular/core` peer range admits an Angular whose linker will
refuse the package's compiled output, as one sentence each. An empty array is a
pass.

## A runnable example

```ts
import { angularPeerFloorsTooLow } from 'ngtrue/node';

it('admits no Angular that cannot link it', async () => {
  expect(await angularPeerFloorsTooLow({ packageDir: 'dist' })).toEqual([]);
});
```

Point it at the built package. The declarations it reads exist only in the
compiled output, so run against a source tree it reads nothing, and it says so.

A finding names the declaration that sets the floor and the version the range
has to start at:

```text
@angular/core is a peer at ">=12.0.0", which admits 12.0.0, and 1 partial
declaration needs newer — the highest, ɵɵngDeclareComponent in
fesm2022/chunk-mention-list.mjs, has minVersion 14.0.0 (published with Angular
14.0.6), which the linker of any Angular below 14.0.0 refuses, so the floor has
to be at least 14.0.0.
```

## The failure it is for

A library ships in partial-compilation mode: each component, directive, pipe,
injectable and service is a `ɵɵngDeclare*` call that the consumer's build
links. Each call records `minVersion`, the oldest linker that can read it. A
consumer on an older Angular gets this at `ng build`:

```text
This application depends upon a library published using Angular version 14.0.6,
which requires Angular version 14.0.0 or newer to work correctly.
```

npm let them install it, because the peer range said they could. The range was
written for the Angular the library started on, and the build moved on without
it. Nothing on the publishing side compares the two numbers, so the library's
own CI is green, and the error appears in a consumer's build, on an Angular the
library's repository no longer installs.

That has been filed against other libraries more than once, each time by a
user rather than the author:
[angular-mentions#238](https://github.com/dmacfarlane/angular-mentions/issues/238)
and [#244](https://github.com/dmacfarlane/angular-mentions/issues/244),
[ngx-color-picker#317](https://github.com/zefoy/ngx-color-picker/issues/317) and
[ng-dynamic-component#473](https://github.com/gund/ng-dynamic-component/issues/473).

## How it answers

It collects every declaration in the JavaScript the `exports` map reaches,
takes the highest `minVersion`, and compares it with the lowest version the
`@angular/core` range admits. That is the linker's own condition rather than an
estimate of it, including the detail that the linker strips prereleases from
both sides: a declaration needing `22.0.0-next.3` links on `22.0.0-next.0`.

Every JavaScript target under every condition is read, wildcard subpaths are
expanded against the files on disk, and relative imports are followed into the
chunks a bundler splits out — dynamic ones included, since that is where
`@angular/build:library` puts the dependencies of a `@defer` block. The
declaration that sets the floor is often in a chunk rather than in the file
`exports` names.

## What it reports instead of passing

- a declaration it found and could not read, since that one might be the one
  needing the newest Angular;
- no declarations at all: a full-compilation build, or a package with no Angular
  code in it;
- nothing to read: no `exports`, or targets that are not there yet;
- no `@angular/core` peer, a range semver cannot read (a `workspace:` protocol,
  say), or a range no version satisfies.

## What a pass does not mean

**A pass is not "supported".** It means every Angular the range admits can
**link** the package, which is narrower than working:

- **Types** are out of scope. The `.d.ts` files reference the Angular types of
  the version that built them, and an older compiler can fail on those with no
  linker involved.
- **Runtime APIs** are out of scope. `minVersion` is about the declaration's
  format. Code calling an API newer than the floor links fine and throws at
  runtime; only a test run on the floor version finds that.
- **Angular's own policy** is stricter. "Ensuring library version
  compatibility" on angular.dev asks for an application built with the same
  Angular as each library or a later one. To have that guarantee, set the floor
  to the version you build with. This check passes that range too.

**`semver` must be installed.** It is an optional peer of ngtrue and this is the
only export that needs it.
