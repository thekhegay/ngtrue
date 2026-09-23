# AGENTS.md

How to work in **ngtrue**. For what it is and how to use it, read
[README.md](README.md) and the docs under [`docs/`](docs/); this file is about
the repository.

## What the package is for, and what that rules out

ngtrue is checks for people who **ship** Angular libraries. The audience is the
spine, not a positioning statement: it is the only thing that stops the package
becoming a bag of utilities, because almost any helper can be argued into a
library called "true" and almost none of them answer a question you only have
when other people install your code.

So the bar for a new export is narrow and it is about provenance rather than
quality. **Either someone else filed the question, or the same need has come up
more than once in a real library** — in practice ngwr, which is where every line
here started. Not "this would be useful". Not "libraries probably want this".
Something that was actually wrong, twice, or that somebody actually asked about.
An export that fails that test is a good idea in the wrong repository, and the
cost of getting it wrong is not the code, it is that the next borderline export
now has a precedent to point at.

## The layout, which is also the rule

```
src/root/      → ngtrue
src/testing/   → ngtrue/testing
src/node/      → ngtrue/node
```

**No export may import another export.** Three sibling directories, and a
relative import may not leave its own.

The lodash version of this rule is about bundle size; here it is about
environment. These entry points do not merely have different audiences, they
need different runtimes, so one import across the line puts
`@angular/core/testing` or `node:fs` on a path an application build can follow.
Bundlers drop unused code well and drop an import whose module might have a side
effect badly, and `node:fs` in a browser build is a resolution error rather than
dead weight.

The symmetry is deliberate: there is no shared folder, so there is nothing to be
tempted by. A helper two entry points want is duplicated on purpose, or it moves
into the root entry point, where paying for it is a decision somebody makes.
`src/entry-points.spec.ts` enforces all of it, including — first — that the scan
found files at all, because a walker matching nothing reports every rule as
held.

**The root entry point is empty and must stay empty until something earns it.**
A placeholder export there invites the next helper to be dropped in because
there is already company, and the root is where a wrong home costs the most: it
is the only one an application can pay for.

## The honest-check rule

**A check that would answer the same for a working library and a broken one must
not exist.** This is the one rule the whole package is judged by, and it is
stricter than it sounds because such a check is worse than nothing — it converts
an unasked question into an answered one, and the answer is always yes.

Where a rule cannot be verified honestly, the JSDoc says so, beside what can. A
refusal is a feature of the documentation and not an apology. Half of what makes
`assertSignalFormsControl` trustworthy is the paragraph listing what it leaves
to a reviewer.

The rule applies to this repository's own tests too:

- Every broken fixture asserts **which rule** was reported, not that something
  threw. A check failing for the wrong reason passes `rejects.toThrow()` and
  then misreports for everyone who ever uses it.
- `errorFrom` in the conformance spec throws when the assertion did NOT throw,
  because `await promise.catch(e => e)` yields `undefined` on success and every
  assertion after it then fails with a message about `undefined` — which reads
  as a broken test rather than a control that quietly passed.
- The freshness check fails when typedoc emits nothing: two empty trees compare
  equal, and an entry-point rename would otherwise report a stale reference as
  fresh.
- The entry-point spec asserts it scanned something before it asserts anything
  about what it scanned.
- `unresolvedExports` reports a package with no `exports` map rather than
  passing it. An empty problem list would be true and would answer a question
  nobody asked.

And it applies to a check's own scope. `assertSignalFormsControl` checks that
`disabled` and `readonly` inputs EXIST and does not check what they do, because
a fixture binding `[formField]` cannot turn either state on — Angular gives no
public way to write a nested directive's signal input. Presence is the whole of
Angular's own mechanism, so presence is what is honestly checkable, and the rest
is written down as a reviewer's job.

## Two return shapes, and the reason for each

`ngtrue/testing` throws. `ngtrue/node` returns the problems it found.

The assertion IS the test, so throwing puts the explanation where the runner
prints it. The node checks feed somebody else's assertion, so returning an array
means `expect(…).toEqual([])` prints the offending subpath instead of "expected
true to be false". Keep it that way; a node check that threw would lose the
finding to a boolean.

## Commands

| Task          | Command                                                             |
| ------------- | ------------------------------------------------------------------- |
| Install       | `npm install`                                                       |
| Build         | `npm run build` (`tsc`, nothing else)                               |
| Typecheck     | `npm run typecheck`                                                 |
| Test          | `npm test` (builds and compiles fixtures first, via `pretest`)      |
| Lint          | `npm run lint` (eslint, then prettier `--check`)                    |
| Format        | `npm run format`                                                    |
| API reference | `npm run docs:api` writes it; `npm run docs:check` fails when stale |
| Docs site     | `npm run docs:dev` / `npm run docs:build`                           |

`npm test` depends on `dist/` existing, because `src/node/self.spec.ts` runs the
three packaging checks against ngtrue's own built package. `pretest` builds it.
That spec throws rather than skipping when `dist/` is absent — a suite that
quietly passed with nothing to look at would be green on exactly the runs that
matter.

**Versions live in `package.json` and nowhere else.** No range is restated in
this file, in the README or in the docs. A copy stays correct until somebody
bumps the original.

## The build is plain `tsc`, and that is load-bearing

Nothing in `src/` outside the test fixtures is a component or a directive. There
is no template to compile and no `ɵɵngDeclare*` for a consumer's linker to
process, so running the Angular compiler over the shipped code would produce
byte-identical output and cost every reader an explanation. Do not add
ng-packagr, and do not add `@angular/build`.

`moduleResolution` is `nodenext`, which is the one place the configuration
departs from the repository this package came out of. ngwr sets `bundler`,
correctly, because ng-packagr bundles it; ngtrue is emitted by `tsc` and loaded
by Node. **Every relative import in `src/` therefore carries an explicit `.js`
extension** — under `nodenext` an extensionless ESM import does not resolve at
runtime, and `unresolvableTypes` exists to catch exactly that class of mistake
in someone else's package.

### The one place the Angular compiler does run

`tsconfig.fixtures.json`, over `src/testing/fixtures/controls.ts`, into
`.fixtures/`.

It has to. Angular's JIT compiler cannot see `input()`, `model()` or `output()`:
they are initializer APIs, so the inputs and outputs they declare exist only
after static analysis, and a JIT-compiled control comes out with an **empty**
definition. The conformance suite reads exactly that definition, and any control
worth checking is written with `model()` — so JIT fixtures would have the suite
proving itself against controls nobody writes. Measured, not assumed: a JIT
`model()` control reports `inputs {}`.

`ngc` rather than a vite plugin, because every plugin that does this pulls in
`@angular/build` — a whole build system this package does not otherwise have,
for two dozen lines of fixture. `@angular/compiler-cli` already ships `ngc`, the
emitted components are ordinary ESM, and the spec hosts that bind them are
compiled just-in-time at run time, which Angular handles for a plain template.
`tsconfig.fixtures.json` sets `"include": []` to clear the base config's glob:
`files` adds to `include` rather than replacing it, and without that the whole
of `src/` joins the program.

**The spec imports the fixture SOURCE and a vite plugin redirects it to the
compiled copy.** Importing `.fixtures/` directly is what that avoids, and not
for tidiness: `.fixtures/` is generated, so an import of it makes `typecheck`
and `lint` fail on a clean checkout and in an editor opened before anything has
been built. Importing the source keeps the fixtures typechecked and linted like
every other file and confines the generated artefact to `vitest.config.ts`.

## Fixtures are whole packages, not mocks

The node checks read a manifest and a filesystem, so a stub of either would only
prove the stub matched what the check expected. `src/node/fixtures/` holds real
little packages — one correct, one wrong in a distinct way per finding, one with
no `exports`, one with no `name`. Each fault is one a real build produces: a
file the build stopped emitting, a subpath with no `types` condition, a pattern
matching nothing, an import nobody declared, a peer nobody imports.

They are excluded from `tsconfig.json`, `tsconfig.build.json`, eslint and the
vitest run, each for its own reason and each with the reason written at the
exclusion. One of them imports a package that is not installed **on purpose**;
typechecking it would be typechecking the bug.

## Documentation

`docs/` is markdown first and the site is a consequence of it — the same files
read correctly in a pull request, in an editor and on the published page.

**`docs/api/` is generated by typedoc and committed**, and `npm run docs:check`
fails when the commit is stale. Committed rather than built on the fly so a pull
request shows what a change did to the public surface; generated rather than
written so it cannot describe an API that no longer exists.

typedoc rather than a generator written here, and the reason is the honest-check
rule again: a hand-rolled extractor reads source with regular expressions, and
the members it fails to match are invisible from birth — it produces a
complete-looking document missing whatever it could not parse, and nothing says
so. typedoc goes through the TypeScript compiler, so a member it omits is a
member that is not exported, and a printed type is the type the compiler
resolved rather than the text somebody typed.

The generator passes `docsRoot` as a parameter. The sidebar holds links relative
to it, so a check generating into a bare temp directory would differ from the
committed copy in every link and call a fresh reference stale.

The JSDoc on each export is the source for both the API reference and the guide
page, so **write the reasoning in the JSDoc** and let the guide page carry the
runnable example and the prose. A rule stated only in `docs/` is a rule the next
person editing the function will not see.

## Style

Explain WHY at the point the question comes up. A comment that restates the code
is noise; a comment naming the failure a line prevents is the only record of it.
Several comments here exist because the obvious version of the code was written
first and was wrong — the block-comment stripper that ate `/**/` inside a glob
string is the clearest one, and it stays described in full because the obvious
version is what the next person will reach for.

Prose in the docs and in commits uses "from X to Y" for a transition, never an
arrow.

Commits are lowercase conventional, single-line subject, no body. No tooling or
assistant attribution anywhere — not in commits, not in files, not in comments.

## Git

Never push to `main`. Branch before starting, commit, push the branch, open a
pull request.
