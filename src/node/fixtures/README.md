Packages for the checks in `src/node` to be pointed at.

Each is a whole package rather than a mock: the checks read `package.json` and
the filesystem, so a stub of either would only prove the stub matched what the
check expected. `sound/` is correct in every way the three checks can measure;
`broken/` is wrong in one way per finding, and each fault is one a real build
produces — a file the build stopped emitting, a subpath with no `types`
condition, a pattern that matches nothing, an import nobody declared, a peer
nobody imports.

They are excluded from `tsconfig.build.json` and never published.
