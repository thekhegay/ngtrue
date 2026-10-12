Packages for the checks in `src/node` to be pointed at.

Each is a whole package rather than a mock: the checks read `package.json` and
the filesystem, so a stub of either would only prove the stub matched what the
check expected. `sound/` is correct in every way the three checks can measure,
including the ways a correct package used to get reported — text in its source
that spells an import, a specifier that names no package (`~/x`), and subpaths
only a stylesheet compiler can reach; `broken/` is wrong in one way per finding,
and each fault is one a real build produces — a file the build stopped
emitting, a subpath with no `types` condition, a pattern that matches nothing,
an import nobody declared, a peer nobody imports. `broken/` also puts text that
only spells an import, and the two shapes a lexer most easily misreads, in front
of a real import of every form, because a scanner is wrong in two directions and
only that order shows both; and its schematics subtree imports a package the
Angular CLI supplies, which is a finding until `exclude` says the subtree runs
somewhere else. `stylesheets/` is a package only a Sass compiler can import,
which `unresolvableTypes` has to report as unprobed rather than pass.

They are excluded from `tsconfig.build.json` and never published.
