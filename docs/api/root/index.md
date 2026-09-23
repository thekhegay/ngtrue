[ngtrue](../index.md) / root

# root

`ngtrue` — the root entry point.

Empty, and empty on purpose.

This is the one entry point whose code may end up in an application bundle,
so it is reserved for pure runtime helpers: something a library would import
from its own `src/`, ship to consumers, and pay for in bytes. Nothing has
earned that yet. The two things ngtrue does today — proving a control is
wired to Signal Forms, and proving a package's manifest describes the files
it actually has — both belong to environments an application never loads, so
they live in `ngtrue/testing` and `ngtrue/node`.

An entry point with a placeholder export in it is worse than an empty one: it
invites the next helper to be dropped here because there is already company,
and the root is precisely where a wrong home is expensive. The rule for what
may land here is in AGENTS.md, and it is the same rule as everywhere else —
a filed question from someone else, or a need that has come up more than once
in a real library.
