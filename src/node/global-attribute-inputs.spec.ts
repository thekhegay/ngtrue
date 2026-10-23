import ts from 'typescript';
import { beforeAll, describe, expect, it } from 'vitest';

import { FIXTURES } from './fixtures/paths.js';
import { globalAttributeInputs } from './global-attribute-inputs.js';
import { readManifest } from './manifest.js';
import { PartialDeclarationReader } from './partial-declarations.js';

/** The class each finding is about: every message opens with it. */
const subjects = (problems: readonly string[]): string[] => problems.map(problem => problem.split(' ')[0] as string);

describe('globalAttributeInputs', () => {
  it('reads every declaration in the sound package, so its empty result is about something', () => {
    // An empty array from a reader that missed half the package would pass the
    // next test for the wrong reason. The sound package spreads its classes over
    // a second entry point reached by the package's own name and a module
    // reached by an extensionless relative import, so all twelve being here is
    // what makes the pass below mean anything.
    const dir = FIXTURES.declarationsSound;
    const names = new PartialDeclarationReader(ts, dir, readManifest(dir))
      .read()
      .flatMap(module => module.declarations.map(declaration => declaration.className))
      .sort();

    expect(names).toEqual([
      'FixtureButton',
      'FixtureCaption',
      'FixtureCard',
      'FixtureCheckbox',
      'FixtureIcon',
      'FixtureLabelled',
      'FixturePanel',
      'FixtureSwitch',
      'FixtureTip',
      'FixtureTipped',
      'FixtureTitled',
      'FixtureViewport',
    ]);
  });

  it('meets FixtureSwitch in the wrapper standard decorators compile to, so following its base is tested', () => {
    // Were TypeScript to emit decorators natively one day, the class would
    // extend FixtureLabelled directly and the pass below would hold without
    // the lookup it exists for.
    const dir = FIXTURES.declarationsSound;
    const reader = new PartialDeclarationReader(ts, dir, readManifest(dir));
    const node = reader
      .read()
      .flatMap(module => module.declarations)
      .find(declaration => declaration.className === 'FixtureSwitch')?.classNode;

    expect(node && reader.baseOf(node)?.getText()).toBe('_classSuper');
  });

  it('finds nothing wrong with a package whose global-attribute inputs never reach a host', async () => {
    expect(await globalAttributeInputs({ packageDir: FIXTURES.declarationsSound })).toEqual([]);
  });

  describe('on a package whose hosts carry them', () => {
    let problems: readonly string[];
    beforeAll(async () => {
      problems = await globalAttributeInputs({ packageDir: FIXTURES.declarationsBroken });
    });
    const about = (className: string): string[] => problems.filter(problem => problem.startsWith(`${className} (`));

    it('names the component, the input and what the attribute does on the host', () => {
      expect(about('FixtureResult')).toEqual([
        'FixtureResult (selector "fixture-result", dist/index.js) has an input "title", and nothing binds ' +
          '[attr.title] on its host: a static title="…" sets the input and stays on the host element, where it ' +
          "draws the browser's native tooltip over the whole host.",
      ]);
    });

    it('matches a camelCase input against the attribute it lands as', () => {
      const [finding] = about('FixtureField');

      expect(finding).toContain('has an input "tabIndex" (the attribute tabindex: HTML attribute names ignore case)');
      expect(finding).toContain('[attr.tabindex]');
    });

    it('does not take a static host attribute for the fix', () => {
      expect(about('FixtureNote')).toHaveLength(1);
      expect(about('FixtureNote')[0]).toContain('has an input "title", and nothing binds [attr.title]');
    });

    it('follows a base class across entry points and through a plain class between', () => {
      expect(about('FixtureRadio')).toHaveLength(1);
      expect(about('FixtureRadio')[0]).toContain('has an input "id" inherited from FixtureControl');
    });

    it('follows a base held in the local a standard-decorated class is wrapped with', () => {
      expect(about('FixtureToggle')).toHaveLength(1);
      expect(about('FixtureToggle')[0]).toContain('has an input "id" inherited from FixtureControl');
    });

    it('finds an input a host directive exposes, under the alias the host gives it', () => {
      expect(about('FixtureSection')).toHaveLength(1);
      expect(about('FixtureSection')[0]).toContain(
        'has an input "hidden" exposed from the host directive FixtureCollapsible, and nothing binds [attr.hidden]',
      );
    });

    it('finds an input a host directive exposes from a host directive of its own', () => {
      // Angular applies a host directive's host directives to the same element,
      // under the names the middle declaration gives them, so FixtureHasTooltip
      // exposing FixtureTooltip's text as `title` puts `title` on this host.
      expect(about('FixtureIconButton')).toEqual([
        'FixtureIconButton (selector "fixture-icon-button", dist/index.js) has an input "title" exposed from the ' +
          'host directive FixtureTooltip through the host directive FixtureHasTooltip, and nothing binds ' +
          '[attr.title] on its host: a static title="…" sets the input and stays on the host element, where it ' +
          "draws the browser's native tooltip over the whole host.",
      ]);
    });

    it('keeps the inputs a base class exposes through its host directives exposed in the subclass', () => {
      expect(about('FixtureLink')).toHaveLength(1);
      expect(about('FixtureLink')[0]).toContain(
        'has an input "title" exposed from the host directive FixtureTooltip through FixtureTooltipped',
      );
    });

    it('reads an installed dependency for a base, and names the package and version the input came from', () => {
      expect(about('FixtureHeadline')).toEqual([
        'FixtureHeadline (selector "fixture-headline", dist/index.js) has an input "title" inherited from ' +
          'FixtureCdkHeading (@fixture/cdk 1.4.0), and nothing binds [attr.title] on its host: a static title="…" ' +
          "sets the input and stays on the host element, where it draws the browser's native tooltip over the " +
          'whole host.',
      ]);
    });

    it('reads an installed host directive’s own host directives, under the names only that package declares', () => {
      expect(about('FixtureHelp')).toHaveLength(1);
      expect(about('FixtureHelp')[0]).toContain(
        'has an input "title" exposed from the host directive FixtureCdkTooltip through the host directive ' +
          'FixtureCdkHasTooltip (@fixture/cdk 1.4.0), and nothing binds [attr.title]',
      );
    });

    it('reports a host directive from a package that is not installed, whose own host directives cannot be read', () => {
      expect(about('FixtureChip')).toEqual([
        'FixtureChip (selector "fixture-chip", dist/index.js) was not fully checked: FixtureChip uses the host ' +
          'directive FixtureCdkScrollable from @fixture/missing/scrolling, and any host directives of its own land ' +
          'on this host under names only that package declares — those cannot be read, because no node_modules ' +
          'above this package holds @fixture/missing. Check its inputs by hand, then add "FixtureChip" to ignore.',
      ]);
    });

    it('still checks the alias a host gives a directive it cannot read, and says its bindings went unread', () => {
      expect(about('FixtureBadge')).toHaveLength(2);
      expect(about('FixtureBadge')[0]).toContain(
        'was not fully checked: FixtureBadge uses the host directive FixtureCdkTooltip from @fixture/missing,',
      );
      expect(about('FixtureBadge')[1]).toContain(
        'has an input "title" exposed from the host directive FixtureCdkTooltip from @fixture/missing, ' +
          'whose host bindings this check could not read',
      );
    });

    it('checks a directive on a custom element the way it checks a component', () => {
      expect(about('FixtureTab')).toHaveLength(1);
      expect(about('FixtureTab')[0]).toContain('has an input "title"');
    });

    it('reports a base class from a package that is not installed instead of passing it', () => {
      expect(about('FixtureStyled')).toContain(
        'FixtureStyled (selector "fixture-styled", dist/index.js) was not fully checked: FixtureStyled extends ' +
          "FixtureCdkScrollable from @fixture/missing/scrolling, and a base class's inputs become its subclass's " +
          'own — those cannot be read, because no node_modules above this package holds @fixture/missing. Check ' +
          'its inputs by hand, then add "FixtureStyled" to ignore.',
      );
    });

    it('still checks the inputs it can see on a class it cannot check completely', () => {
      expect(about('FixtureStyled').some(problem => problem.includes('has an input "title"'))).toBe(true);
    });

    it('reports a base an installed package exports in a form it cannot follow to a class', () => {
      expect(about('FixtureLegacy')).toEqual([
        'FixtureLegacy (selector "fixture-legacy", dist/index.js) was not fully checked: FixtureLegacy extends ' +
          'FixtureCdkDisableable from @fixture/cdk, which could not be followed to a class in @fixture/cdk 1.4.0. ' +
          'Check its inputs by hand, then add "FixtureLegacy" to ignore.',
      ]);
    });

    it('reports a base an installed package compiled in full mode, rather than walking through it', () => {
      // The base has a `title` and no host binding, as FixtureHeadline's does.
      // Taken for a plain class, it would add nothing and this would pass.
      expect(about('FixtureBanner')).toEqual([
        'FixtureBanner (selector "fixture-banner", dist/index.js) was not fully checked: FixtureBanner extends ' +
          "FixtureFullHeading (@fixture/full 2.0.0), which was compiled in full mode, and a base class's inputs " +
          "become its subclass's own — a full-mode definition is code for the runtime rather than a partial " +
          'declaration, so they cannot be read. Check its inputs by hand, then add "FixtureBanner" to ignore.',
      ]);
    });

    it('reports a base that is not a class it can follow, such as a mixin call', () => {
      expect(about('FixtureSized')).toEqual([
        'FixtureSized (selector "fixture-sized", dist/index.js) was not fully checked: FixtureSized extends ' +
          'withSize(FixtureControl), which could not be followed to a class. Check its inputs by hand, then add ' +
          '"FixtureSized" to ignore.',
      ]);
    });

    it('reports those and nothing else, in a stable order', () => {
      expect(subjects(problems)).toEqual([
        'FixtureBadge',
        'FixtureBadge',
        'FixtureBanner',
        'FixtureChip',
        'FixtureField',
        'FixtureHeadline',
        'FixtureHelp',
        'FixtureIconButton',
        'FixtureLegacy',
        'FixtureLink',
        'FixtureNote',
        'FixtureRadio',
        'FixtureResult',
        'FixtureSection',
        'FixtureSized',
        'FixtureStyled',
        'FixtureStyled',
        'FixtureTab',
        'FixtureToggle',
      ]);
    });
  });

  describe('ignore', () => {
    it('accepts one input by "Class.input" and leaves every other finding alone', async () => {
      const all = await globalAttributeInputs({ packageDir: FIXTURES.declarationsBroken });
      const some = await globalAttributeInputs({
        packageDir: FIXTURES.declarationsBroken,
        ignore: ['FixtureResult.title'],
      });

      expect(subjects(some)).not.toContain('FixtureResult');
      expect(some).toHaveLength(all.length - 1);
    });

    it('accepts an incomplete check by bare class name without silencing that class’s inputs', async () => {
      const problems = await globalAttributeInputs({
        packageDir: FIXTURES.declarationsBroken,
        ignore: ['FixtureStyled'],
      });
      const styled = problems.filter(problem => problem.startsWith('FixtureStyled ('));

      expect(styled).toHaveLength(1);
      expect(styled[0]).toContain('has an input "title"');
    });

    it('says a bare class name accepts only an incomplete check, rather than that the class is gone', async () => {
      const problems = await globalAttributeInputs({
        packageDir: FIXTURES.declarationsBroken,
        ignore: ['FixtureResult'],
      });

      expect(problems).toContain(
        'ignore lists "FixtureResult", which accepts only an incomplete check, and FixtureResult was checked ' +
          'completely. To accept an input, list it by name: "FixtureResult.title".',
      );
      expect(subjects(problems)).toContain('FixtureResult');
    });

    it('reports an entry that matches nothing, so the list cannot outlive the code it excuses', async () => {
      const problems = await globalAttributeInputs({
        packageDir: FIXTURES.declarationsSound,
        ignore: ['FixtureCard.title'],
      });

      expect(problems).toEqual([
        'ignore lists "FixtureCard.title", which matches no finding — the class or the input is gone, renamed ' +
          'or already fixed, so the entry can go.',
      ]);
    });
  });

  it('reports, rather than passes, a package with no partial declarations to read', async () => {
    // An empty array here would be true — no declaration leaks anything — and
    // would answer a question nobody asked. This is what a package compiled in
    // full mode, or a path pointed at the wrong directory, looks like.
    const problems = await globalAttributeInputs({ packageDir: FIXTURES.sound });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('found 0 partial declaration(s)');
    expect(problems[0]).toContain('nothing was checked');
    expect(problems[0]).toContain('compiled in full mode');
  });

  it('reports a partial package with nothing on a custom element without blaming full mode', async () => {
    // A headless directive library is built the right way and has nothing in
    // scope. Saying it was compiled in full mode would be false, and would send
    // its author after a build problem that is not there.
    expect(await globalAttributeInputs({ packageDir: FIXTURES.declarationsHeadless })).toEqual([
      'read 1 JavaScript file(s) reachable from `exports` and found 3 partial declaration(s), none of them on a ' +
        'custom element — so nothing was checked. A selector that names no custom element (here `[fixtureHint]`) ' +
        'puts a declaration on an element the consumer chose, where the native attribute may be exactly what they ' +
        'want, and a declaration with no selector is never a host at all; this check skips both, so a package made ' +
        'only of them has nothing for it to read.',
    ]);
  });

  it('says so when a package has no `exports` to start from', async () => {
    const problems = await globalAttributeInputs({ packageDir: FIXTURES.noExports });

    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('declares no `exports`');
  });
});
