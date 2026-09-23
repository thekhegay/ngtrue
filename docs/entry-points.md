# The three entry points

ngtrue is one package with three subpaths, split by **the environment the code
runs in** — exactly the split between `@angular/core` and
`@angular/core/testing`, and for exactly the same reason.

| Subpath          | Runs in                   | May import                         |
| ---------------- | ------------------------- | ---------------------------------- |
| `ngtrue`         | an application, in theory | nothing environment-specific       |
| `ngtrue/testing` | a test run                | `@angular/core/testing`, a fixture |
| `ngtrue/node`    | a build, a script, a test | `node:fs` and the rest of Node     |

## The rule

**No export may import another export.**

It is the mistake that made lodash untreeshakable — one module reaching for
another until importing `debounce` cost you the library — and here the stakes
are higher than bytes. These entry points are not three flavours of the same
code; they need three different runtimes. A single import across the line does
not merely enlarge a bundle, it puts `@angular/core/testing` or `node:fs` on a
path an application build can follow. Bundlers are good at dropping unused code
and bad at dropping an import whose module might have a side effect, and
`node:fs` in a browser build is a resolution error rather than dead weight.

So the rule is structural rather than advisory. `src/` holds one directory per
entry point, three siblings, and a relative import may not leave its own
directory. There is no shared folder to be tempted by. A helper two of them want
is duplicated on purpose, or it moves into the root entry point, where paying
for it is a decision somebody makes rather than a consequence nobody sees.

`src/entry-points.spec.ts` enforces it, in four parts: no relative import
crosses a boundary, no import by package name crosses one either,
`@angular/core/testing` appears only under `src/testing`, `node:` appears only
under `src/node` — and, before any of that, that the scan found files at all.
A walker that quietly matched nothing would report every rule as held.

## Why the root is empty

`ngtrue` exports nothing today.

It is reserved for pure runtime helpers: something a library would import from
its own `src/`, ship to consumers, and pay for in bytes. Nothing has earned
that. Both of the things ngtrue does belong to environments an application never
loads.

An entry point with a placeholder in it is worse than an empty one. It invites
the next helper to be dropped there because there is already company, and the
root is precisely where a wrong home is expensive. When something does belong
there it will arrive the way everything here arrives: because someone asked a
question that needed it, or because the same need came up more than once in a
real library.

## Why one package rather than three

Three packages would enforce the same boundary with no test at all — and would
cost three release trains, three changelogs, and a version matrix for consumers
to reason about, for a codebase measured in hundreds of lines. The shape is
lodash's: one name to install, many exports, each independent. The difference is
that this one keeps the property lodash lost, and keeps it by writing it down
and testing it.
