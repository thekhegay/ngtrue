[ngtrue](../../index.md) / [node](../index.md) / unloadableEntryPoints

# Function: unloadableEntryPoints()

> **unloadableEntryPoints**(`options`): `Promise`\<readonly `string`[]\>

Defined in: [src/node/unloadable-entry-points.ts:189](https://github.com/thekhegay/ngtrue/blob/main/src/node/unloadable-entry-points.ts#L189)

Every entry point of a built package that throws while it is imported —
unlinked, in a fresh Node process with no DOM — as one sentence each. An
empty array is a pass.

```ts
it('loads every entry point unlinked and without a DOM', async () => {
  expect(await unloadableEntryPoints({ packageDir: 'dist' })).toEqual([]);
});
```

## The question

Can a consumer's test runner, or their server, import each entry point this
package ships? Or does evaluating the published JavaScript throw before the
first test, or the first `isPlatformBrowser`, gets to run? Two kinds of
failure answer no, and neither shows anywhere the author looks.

**A class read before its declaration ran.** A library build in partial mode
keeps the dependencies of `ɵɵngDeclareFactory` and the predicates of its
queries and `hostDirectives` in static initializers, which run when the
class is defined. A class that names one declared further down the same
bundle therefore reads it in its temporal dead zone — `ReferenceError: Cannot
access 'FxDropdown' before initialization`. An application build never sees
it, because the linker rewrites those initializers into functions that run
later; `ngc` does not warn, and the library's own tests run its sources. What
does see it is a runner that loads the package unlinked, and the default
`ng test` is one: `@angular/build:unit-test` loads `@angular/compiler` first
and builds the tests with `externalPackages: true`, so Vitest's Node imports
the published bundle exactly as this check does. `forwardRef` does not help
in `hostDirectives`; declaring the class first does. Other people reported
it thirteen times —
[angular/angular-cli#34198](https://github.com/angular/angular-cli/issues/34198),
[MintPlayer/mintplayer-ng-bootstrap#419](https://github.com/MintPlayer/mintplayer-ng-bootstrap/issues/419),
[Gamekohl/frame-ui#11](https://github.com/Gamekohl/frame-ui/issues/11),
[Angular-Material-Dev/mat-exp#21](https://github.com/Angular-Material-Dev/mat-exp/issues/21),
[NG-ZORRO/ng-zorro-antd#9557](https://github.com/NG-ZORRO/ng-zorro-antd/issues/9557),
[angular/components#32408](https://github.com/angular/components/issues/32408),
[ngxpert/hot-toast#22](https://github.com/ngxpert/hot-toast/issues/22),
[mr-samani/ngx-input-color#8](https://github.com/mr-samani/ngx-input-color/issues/8),
[KroneCorylus/ngx-colors#176](https://github.com/KroneCorylus/ngx-colors/issues/176),
[h-k-dev/angular-email-editor#2](https://github.com/h-k-dev/angular-email-editor/issues/2),
[IgniteUI/igniteui-angular#15020](https://github.com/IgniteUI/igniteui-angular/issues/15020),
[MurhafSousli/ngx-gallery#633](https://github.com/MurhafSousli/ngx-gallery/issues/633) and
[graycoreio/daffodil#4593](https://github.com/graycoreio/daffodil/issues/4593),
the last with `forwardRef` already in place.

**A browser global read at the top level of a module**, by the package or by
a dependency it imports. A server that imports the entry point — SSR,
prerendering, a dev server — fails with `window is not defined` before any
code that could have checked the platform runs, and the consumer cannot
catch it: [bluehalo/ngx-leaflet#369](https://github.com/bluehalo/ngx-leaflet/issues/369),
where leaflet reads `document` at load and `@defer` does not help, and
[#62](https://github.com/bluehalo/ngx-leaflet/issues/62) before it;
[RobinHerbots/Inputmask#2628](https://github.com/RobinHerbots/Inputmask/issues/2628),
[vime-js/vime#316](https://github.com/vime-js/vime/issues/316),
[ITS-HCD/nysds#1677](https://github.com/ITS-HCD/nysds/issues/1677),
[auth0/auth0-angular#432](https://github.com/auth0/auth0-angular/issues/432) and
[juristr/ngx-lazy-el#36](https://github.com/juristr/ngx-lazy-el/issues/36).
A test environment with a DOM defines `window`, so the library's tests pass.

## How it answers

**Each literal subpath with a JavaScript target is imported in a fresh
`node` process**, a few at a time. Fresh because evaluation order is part of
the answer: two entry points sharing a chunk in a cycle can evaluate it in an
order that throws from one and not from the other, and a process that had
already imported the second would pass the first.

**By the package's own name, from `packageDir`.** Node resolves a package's
own name through its `exports` map — the same resolution, under the same
`import` conditions, that a consumer's `import` goes through — so the file
that runs is the one a consumer gets, and its own imports resolve from where
it sits. The process starts with `NODE_OPTIONS` cleared, so a loader or a
condition the test runner was started with does not leak into the answer.

**After `@angular/compiler`, resolved from `packageDir`, and then `preload`.**
Unlinked partial declarations fall back to the JIT compiler, as they do in
`ng test`; without it every declaration throws, and the check would report
every entry point for a reason no consumer meets. So it is loaded first, and
when it does not resolve from `packageDir` the check throws instead of
answering. The copy next to the package is the one its `@angular/core` would
meet in a consumer's install.

## What counts as a finding

Anything that throws while the entry point's modules EVALUATE — its own or a
dependency's — with Node's message and the first frame of the stack, and a
second frame inside the package when the first is outside it. A read in the
temporal dead zone is described as the unlinked-test failure above, and a
global Node does not define as the server failure. A top-level `await` that
never settles is a finding too: Node gives up on it, and a consumer's import
waits forever.

## What is reported as not probed

Reported, so an empty array still means everything was imported, and
`ignore` can acknowledge each:

- **What Node's loader refuses before any of the code runs** — a package that
  does not resolve (declared or not), a file extension or a directory import
  Node does not accept, JSON imported without `with { type: 'json' }`, a named
  import a CommonJS module does not expose to Node. A bundler resolves and
  links by rules of its own, and a server build bundles its dependencies, so
  Node's refusal alone does not say a consumer's import fails.
- **An import that had not finished when `timeout` ran out.**
- **A pattern subpath**, which stands for files that cannot be imported by
  its literal name. List them literally, or acknowledge the pattern.

Subpaths that are not JavaScript — stylesheets, JSON, declaration files — are
left out without a word. A package with no `exports`, or none with a
JavaScript target, is reported, and so is a run in which nothing was
imported, even when `ignore` acknowledged every line: acknowledging a subpath
excuses the line about it and does not turn "nothing was imported" into
"nothing was wrong".

## What it does not check

**Any environment but this one**: Node without a DOM, Node's resolver and
conditions, the JIT compiler where an application has the linker. A pass says
nothing about a linked production build. It says nothing about the DOM
either, once rendering starts: a constructor or `ngOnInit` that reads
`window` on the server is past the import and out of reach here.

**Anything after evaluation.** The process reports as soon as the import
settles, so a timer or a promise rejection the module leaves behind is not
seen.

**Globals Node does define.** Node 21 and later define `navigator`, so reading
it at the top level passes here, as it does on a real server.

**It runs code.** The top level of every entry point and of everything it
imports executes, as it does in `unloadableSchematics` — point it at
packages you would run anyway.

## Parameters

### options

[`UnloadableEntryPointsOptions`](../interfaces/UnloadableEntryPointsOptions.md)

## Returns

`Promise`\<readonly `string`[]\>

## Since

0.3.0
