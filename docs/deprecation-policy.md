# Deprecation policy

Most of ngtrue exists because Angular has not made something checkable yet. That
is a good reason to write a check and a bad reason to keep one, so the
retirement path matters more here than it would in a library whose value does
not have an expiry date.

## When Angular ships it, the export is deprecated, not deleted

An export whose job the framework has taken over gets `@deprecated` in its
JSDoc, **naming the replacement**, and keeps working. It is removed in a later
major, and never in the release that deprecates it.

```ts
/**
 * @deprecated Angular 24 reports this itself: a control missing a `readonly`
 *   input now produces NG1918 at binding time. Delete the assertion.
 */
```

Two reasons, and the second is the real one.

The obvious one is that a library's tests are not code anyone is eager to
revisit. An export that vanishes turns a green suite into a build error at
upgrade time, in a file the upgrader did not open and does not have context for.

The one that matters more: **ngtrue's whole argument is that a silent failure is
worse than a loud one.** A package built on that cannot make its own removals
silent. A deprecation that stays for a release is the loud version — the
compiler says it, in the editor, with the replacement in the message, at a
moment when nothing is broken.

## What the replacement has to be

Named, and specific enough to act on. "Angular handles this now" is not a
replacement; a rule number, an API, or a sentence saying the check is no longer
needed and why, is.

If there is no replacement — if the export was a mistake rather than a stopgap —
the deprecation says that instead. Being wrong is a legitimate reason to remove
something, and pretending a migration exists when it does not wastes more of a
reader's time than admitting it.

## Versioning

Semver, read strictly, with the surface being what the `exports` map advertises
and the types behind it.

- **Patch** — a check finds something it should always have found, or a message
  gets clearer.
- **Minor** — a new export, a new option, a new rule that a conforming library
  already passes.
- **Major** — a new rule that a previously-passing library can fail, a removed
  export, a changed signature.

That third line is the one with teeth. A rule added to `assertSignalFormsControl`
is a breaking change whenever it can turn a green suite red, even though nothing
about the caller's code changed — because from where the caller sits there is no
difference between "ngtrue got stricter" and "ngtrue broke". New rules therefore
arrive in majors, and the release notes say which one is new and what it catches.
