# Contributing

## Before a change

Read [AGENTS.md](AGENTS.md). It holds the rules this repository is built on,
with the reasoning behind each one, and a change that contradicts it needs to
argue with the reasoning rather than ignore it.

Two of those rules decide most reviews:

- **A check that cannot fail honestly must not exist.** If a rule cannot be
  verified from what the runtime gives you, say so in the JSDoc instead of
  writing something that passes on a broken library.
- **No export imports another export across entry points.** `ngtrue`,
  `ngtrue/testing` and `ngtrue/node` run in different environments, and a
  crossing drags `@angular/core/testing` or `node:fs` into an application
  bundle. A test enforces this.

## Working on it

```sh
npm install
npm test          # builds, compiles the fixtures, then runs vitest
npm run lint
npm run docs:api  # regenerates the API reference, commit what changes
```

Every shipped function needs a test, and a check needs a fixture that makes it
fail for the right reason. A green test that would stay green with the fix
removed proves nothing.

## Commits and pull requests

Conventional commits, lowercase subject, one line. The pull request title is
checked by the same rule.

## Adding an export

An export earns its place when someone filed the question or when it is the
third time the same helper is written by hand in a real library. A utility that
might be useful does not qualify - that is how a focused package becomes a
grab bag nobody can review.
