# unloadableEntryPoints

`ngtrue/node`

Every entry point of your built package that **throws while it is imported** —
unlinked, in a fresh Node process with no DOM — as one sentence each. An empty
array is a pass.

## A runnable example

```ts
import { unloadableEntryPoints } from 'ngtrue/node';

it('loads every entry point unlinked and without a DOM', async () => {
  expect(await unloadableEntryPoints({ packageDir: 'dist' })).toEqual([]);
});
```

Point it at the built package, the directory you would publish. It imports
`@angular/compiler` before each entry point, resolved from that directory, so
the package's own install has to have it — an Angular repository does.

If your consumers load a polyfill before your code, load it here too:

```ts
await unloadableEntryPoints({ packageDir: 'dist', preload: ['@angular/localize/init'] });
```

## The two failures it exists for

**A class read before its declaration ran.** In a partial build, the
dependencies of `ɵɵngDeclareFactory` and the predicates of queries and
`hostDirectives` sit in static initializers, which run when the class is
defined. Inject a class through the constructor, query it, or list it as a host
directive above its own declaration, and the published bundle reads it in its
temporal dead zone:

```
ReferenceError: Cannot access 'FxDropdown' before initialization
```

An application build never sees it, because the linker turns those
initializers into functions that run later. `ngc` does not warn, and your tests
run your sources. The default `ng test` does see it: `@angular/build:unit-test`
loads `@angular/compiler` first and builds the tests with
`externalPackages: true`, so Vitest imports your published bundle unlinked,
exactly as this check does. Jest does the same. `forwardRef` does not help in
`hostDirectives`; declaring the class first does. Thirteen reports against
Angular libraries trace back to it, among them angular/angular-cli#34198,
angular/components#32408, NG-ZORRO/ng-zorro-antd#9557 and
graycoreio/daffodil#4593.

**A browser global read at the top level of a module**, yours or a
dependency's. A server that imports the entry point — SSR, prerendering, the
dev server — fails with `window is not defined` before any `isPlatformBrowser`
check can run, and your consumer cannot catch it. bluehalo/ngx-leaflet#369 is
the clearest case: leaflet reads `document` as it loads, and `@defer` does not
help. A test environment with a DOM defines `window`, so your tests pass.

## How it answers

**One fresh `node` process per entry point**, a few at a time. Fresh because
evaluation order is part of the answer: two entry points sharing a chunk in an
import cycle can evaluate it in an order that throws from one and not from the
other, and a process that had already imported the second would pass the
first.

**By your package's own name, from `packageDir`.** Node resolves a package's
own name through its `exports` map, the same resolution under the same `import`
conditions a consumer's `import` goes through, so the file that runs is the one
a consumer gets. `NODE_OPTIONS` is cleared, so a loader or condition your test
runner was started with does not leak into the answer.

**`@angular/compiler` first, then `preload`, then the entry point.** Unlinked
partial declarations fall back to the JIT compiler, as they do in `ng test`.
Without it every declaration throws and every entry point would be reported,
so when it does not resolve from `packageDir` the check throws instead.

## What counts as a finding

- Anything thrown while the entry point's modules evaluate, yours or a
  dependency's, with Node's message and the first frame of the stack — plus the
  frame inside your package when the throw is in a dependency. A read in the
  temporal dead zone is described as the unlinked-test failure, and a global
  Node does not define as the server failure.
- A top-level `await` that never settles. Node gives up with exit code 13, and
  a consumer's import waits forever.
- A module that ends the process while it is imported.

## What is reported as not probed

Reported, so an empty array still means everything was imported, and each can
be acknowledged in `ignore` by its subpath:

- **What Node's loader refuses before your code runs**: a package that does not
  resolve, an extension or a directory import Node does not accept, JSON
  imported without `with { type: 'json' }`, a named import a CommonJS module
  does not expose to Node. A bundler resolves and links by its own rules, and a
  server build bundles its dependencies, so Node's refusal alone does not mean a
  consumer's import fails.
- **An import still running when `timeout` ran out** (30 seconds by default).
- **A pattern subpath** such as `./locales/*`, which cannot be imported by its
  literal name.

```ts
await unloadableEntryPoints({ packageDir: 'dist', ignore: ['./schematics/*'] });
```

An `ignore` entry that excuses nothing is reported, so the list cannot outlive
the entry point it was written for. Subpaths that are not JavaScript —
stylesheets, JSON, declaration files — are left out without a word. A package
with no `exports`, or none with a JavaScript target, is reported, and so is a
run that imported nothing, even when `ignore` acknowledged every line.

## What it does not check

**Any environment but this one**: Node without a DOM, Node's resolver and
conditions, the JIT compiler where an application has the linker. A pass says
nothing about a linked production build, and nothing about the DOM once
rendering starts — a constructor or `ngOnInit` that reads `window` on the
server is past the import and out of reach here.

**Anything after evaluation.** The process reports as soon as the import
settles, so a timer or a promise rejection left behind is not seen.

**Globals Node does define.** Node 21 and later define `navigator`, so reading
it at the top level passes here, as it does on a real server.

**It runs code.** The top level of every entry point and of everything it
imports executes, as with `unloadableSchematics`. Point it at packages you
would run anyway.
