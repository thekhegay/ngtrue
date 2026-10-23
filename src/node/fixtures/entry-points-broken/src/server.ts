/** A registry kept on `window`, written at the top level of the module — the shape of ITS-HCD/nysds#1677. */
declare global {
  interface Window {
    fixtureRegistry?: Map<string, unknown>;
  }
}

window.fixtureRegistry ??= new Map();

export const registry = window.fixtureRegistry;
