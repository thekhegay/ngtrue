import { lt } from 'semver';
import { describe, expect, it } from 'vitest';

import { angularPeerFloorsTooLow } from './angular-peer-floors-too-low.js';
import { FIXTURES } from './fixtures/paths.js';

const NO_PEER =
  'the manifest declares no @angular/core peer dependency, so nothing holds a consumer to an Angular ' +
  'that can link its declarations.';

function noDeclarations(files: number): string {
  return (
    `none of the ${String(files)} JavaScript file${files === 1 ? '' : 's'} \`exports\` reaches ` +
    'contains a partial declaration (`ɵɵngDeclare*`), so there is no minVersion to hold the ' +
    '@angular/core range to — a full-compilation build, a package with no Angular code, ' +
    'or declaration names a bundler escaped.'
  );
}

describe('angularPeerFloorsTooLow', () => {
  it('finds nothing wrong with a range whose floor links every declaration', async () => {
    expect(await angularPeerFloorsTooLow({ packageDir: FIXTURES.angularSound })).toEqual([]);
  });

  it('strips the prerelease from the floor before comparing, the way the linker does', async () => {
    // The fixture is only a test of the stripping if plain semver disagrees
    // with the linker about it. If this first line ever fails, the fixture has
    // stopped exercising anything.
    //
    // The declaration's side is stripped too, and no fixture can tell: once the
    // floor is a release F, F is below N-next.3 exactly when it is below N, so
    // that half changes only which version a finding names, never whether
    // there is one.
    expect(lt('22.0.0-next.0', '22.0.0-next.3')).toBe(true);

    expect(await angularPeerFloorsTooLow({ packageDir: FIXTURES.angularPrerelease })).toEqual([]);
  });

  describe('on a range written for an older Angular than the build needs', () => {
    it('names the declaration, the floor and the version it has to rise to', async () => {
      expect(await angularPeerFloorsTooLow({ packageDir: FIXTURES.angularFloorLow })).toEqual([
        '@angular/core is a peer at ">=12.0.0", which admits 12.0.0, and 1 partial declaration needs newer — ' +
          'the highest, ɵɵngDeclareComponent in fesm2022/chunk-mention-list.mjs, has minVersion 14.0.0 ' +
          '(published with Angular 14.0.6), which the linker of any Angular below 14.0.0 refuses, ' +
          'so the floor has to be at least 14.0.0.',
      ]);
    });

    it('follows relative imports into chunks, where the declaration that breaks it lives', async () => {
      // Everything in the file `exports` names needs 12.0.0, which the range
      // admits. Read without following its import, this package passes.
      const [problem] = await angularPeerFloorsTooLow({ packageDir: FIXTURES.angularFloorLow });

      expect(problem).toContain('fesm2022/chunk-mention-list.mjs');
    });

    it('follows a dynamic import into the chunk a `@defer` block was split into', async () => {
      // A real build: nothing imports the chunk statically, because the
      // compiler drops the import of a deferred dependency. A check that
      // followed only `from` would read the entry file alone and pass.
      expect(await angularPeerFloorsTooLow({ packageDir: FIXTURES.angularDeferred })).toEqual([
        '@angular/core is a peer at ">=21.0.0", which admits 21.0.0, and 1 partial declaration needs newer — ' +
          'the highest, ɵɵngDeclareService in fesm2022/chart-C-jyOJ0s.mjs, has minVersion 22.0.0 ' +
          '(published with Angular 22.2.1), which the linker of any Angular below 22.0.0 refuses, ' +
          'so the floor has to be at least 22.0.0.',
      ]);
    });

    it('reads a file reached only through a wildcard subpath', async () => {
      // `^21.0.0` holds for the root entry point. The `@Service()` that needs
      // 22 is behind `./services/*`, so a check that skipped patterns would
      // pass this package.
      expect(await angularPeerFloorsTooLow({ packageDir: FIXTURES.angularService })).toEqual([
        '@angular/core is a peer at "^21.0.0", which admits 21.0.0, and 1 partial declaration needs newer — ' +
          'the highest, ɵɵngDeclareService in fesm2022/services/clock.mjs, has minVersion 22.0.0 ' +
          '(published with Angular 22.0.0), which the linker of any Angular below 22.0.0 refuses, ' +
          'so the floor has to be at least 22.0.0.',
      ]);
    });
  });

  describe('reports what it could not measure, rather than passing it', () => {
    it('says so when the build is full compilation and carries no declarations', async () => {
      // An empty list here would read as "the range fits", about a package
      // whose output no range can describe.
      expect(await angularPeerFloorsTooLow({ packageDir: FIXTURES.angularFull })).toEqual([noDeclarations(1)]);
    });

    it('names a declaration it found and could not read, and a range it could not read', async () => {
      // The class metadata that follows the unreadable component is readable,
      // so a reader that searched past the call for the two keys would borrow
      // its 12.0.0 and report nothing about the component.
      expect(await angularPeerFloorsTooLow({ packageDir: FIXTURES.angularUnreadable })).toEqual([
        'fesm2022/angular-unreadable.mjs has 1 partial declaration whose minVersion could not be read, ' +
          'so the Angular it needs was not compared and may be newer than the range admits.',
        'the @angular/core peer range "workspace:^" is not a semver range, so its floor cannot be read.',
      ]);
    });

    it('says when the JavaScript `exports` names is not there to read, and when no version fits the range', async () => {
      expect(await angularPeerFloorsTooLow({ packageDir: FIXTURES.angularUnbuilt })).toEqual([
        `\`exports\` reaches no JavaScript file that exists under ${FIXTURES.angularUnbuilt}, so nothing was read — ` +
          'point `packageDir` at the built package.',
        'the @angular/core peer range ">=15.0.0 <15.0.0" admits no version at all.',
      ]);
    });

    it('reports a package with no Angular in it on both counts', async () => {
      expect(await angularPeerFloorsTooLow({ packageDir: FIXTURES.sound })).toEqual([noDeclarations(2), NO_PEER]);
    });

    it('reports a package with no `exports` instead of guessing at its entry points', async () => {
      expect(await angularPeerFloorsTooLow({ packageDir: FIXTURES.noExports })).toEqual([
        'the manifest declares no `exports`, so there is no JavaScript to read partial declarations from — ' +
          'this check follows `exports` and nothing else.',
        NO_PEER,
      ]);
    });
  });
});
