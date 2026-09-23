[ngtrue](../index.md) / node

# node

`ngtrue/node` — checks that read the file system.

Node APIs only. Everything here answers a question about a package as it
exists on disk: what its manifest promises, and whether the build kept the
promise. None of it may be imported by `ngtrue` or `ngtrue/testing`, and the
reason is more than tidiness — a single import across that line would put
`node:fs` on a path an application bundler can follow.

Each function returns the problems it found as an array of sentences, empty
when there are none, so a caller writes `expect(…).toEqual([])` and gets the
offender printed by the test runner rather than "expected true to be false".
The conformance suite in `ngtrue/testing` throws instead, because there the
assertion IS the test; here the assertion belongs to the caller.

## Interfaces

- [PeerDependencyMismatchesOptions](interfaces/PeerDependencyMismatchesOptions.md)
- [UnresolvableTypesOptions](interfaces/UnresolvableTypesOptions.md)
- [UnresolvedExportsOptions](interfaces/UnresolvedExportsOptions.md)

## Type Aliases

- [ResolutionMode](type-aliases/ResolutionMode.md)

## Functions

- [peerDependencyMismatches](functions/peerDependencyMismatches.md)
- [unresolvableTypes](functions/unresolvableTypes.md)
- [unresolvedExports](functions/unresolvedExports.md)
