/**
 * `ngtrue/node` — checks that read the file system.
 *
 * Node APIs only. Everything here answers a question about a package as it
 * exists on disk: what its manifest promises, and whether the build kept the
 * promise. None of it may be imported by `ngtrue` or `ngtrue/testing`, and the
 * reason is more than tidiness — a single import across that line would put
 * `node:fs` on a path an application bundler can follow.
 *
 * Each function returns the problems it found as an array of sentences, empty
 * when there are none, so a caller writes `expect(…).toEqual([])` and gets the
 * offender printed by the test runner rather than "expected true to be false".
 * The conformance suite in `ngtrue/testing` throws instead, because there the
 * assertion IS the test; here the assertion belongs to the caller.
 *
 * @packageDocumentation
 */

export { angularPeerFloorsTooLow, type AngularPeerFloorsTooLowOptions } from './angular-peer-floors-too-low.js';
export { globalAttributeInputs, type GlobalAttributeInputsOptions } from './global-attribute-inputs.js';
export { peerDependencyMismatches, type PeerDependencyMismatchesOptions } from './peer-dependency-mismatches.js';
export { unexportedTypes, type UnexportedTypesOptions } from './unexported-types.js';
export { unresolvableTypes, type ResolutionMode, type UnresolvableTypesOptions } from './unresolvable-types.js';
export { unloadableEntryPoints, type UnloadableEntryPointsOptions } from './unloadable-entry-points.js';
export { unloadableSchematics, type UnloadableSchematicsOptions } from './unloadable-schematics.js';
export { unresolvedExports, type UnresolvedExportsOptions } from './unresolved-exports.js';
