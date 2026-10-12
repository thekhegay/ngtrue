import { resolve } from 'node:path';

import { exportTargets, readManifest } from './manifest.js';
import { PartialDeclarationReader, type HostDirectiveUse, type PartialDeclaration } from './partial-declarations.js';
import { loadTypeScript } from './probe.js';

/** Options for {@link globalAttributeInputs}. */
/** @since 0.2.0 */
export interface GlobalAttributeInputsOptions {
  /**
   * The directory holding the `package.json` to check — the BUILT package, the
   * one that would be packed. The check reads the partial declarations in the
   * JavaScript it ships, so a source tree has nothing for it to read.
   */
  readonly packageDir: string;
  /**
   * Findings you have looked at and accepted.
   *
   * `"WrFoo.title"` accepts one input: the component means the native attribute
   * to stay, or removes it in code where this check cannot see. A bare
   * `"WrFoo"` accepts that WrFoo could not be checked completely — it extends a
   * class from another package, or carries a host directive from one — and does
   * NOT silence its input findings, which keep being reported until each is
   * listed by name.
   *
   * An entry that matches nothing is reported too, so the list cannot outlive
   * the code it excuses.
   */
  readonly ignore?: readonly string[];
}

/**
 * Global attributes that DO something to the element carrying them, each with
 * what it does to a component host. The list is curated by that effect, not
 * copied from the HTML spec's list of global attributes; what was left out, and
 * why, is in the JSDoc of {@link globalAttributeInputs}.
 */
const ATTRIBUTES: ReadonlyMap<string, string> = new Map([
  ['title', "draws the browser's native tooltip over the whole host"],
  [
    'id',
    'gives the HOST that id, so a <label for>, a fragment link or getElementById finds the host instead of the element the input was meant for — and, where the component forwards the id inside, two elements share it',
  ],
  [
    'hidden',
    "hides the whole host through the user-agent stylesheet's [hidden] rule, unless a host style sets display",
  ],
  [
    'lang',
    'changes the language of the whole host subtree: hyphenation, quotation marks, font fallback and the voice a screen reader reads it in',
  ],
  ['dir', 'flips the writing direction, and with it the layout, of the whole host subtree'],
  [
    'tabindex',
    'makes the host itself focusable, a tab stop or click target around the control the input was meant for',
  ],
  ['accesskey', "binds the browser's access-key shortcut to the host, in front of the control the input was meant for"],
  ['draggable', 'makes the whole host a native drag source when the value is "true"'],
  ['spellcheck', 'is inherited by every editable element in the host, not only the one the input was meant for'],
  ['contenteditable', 'makes the whole host editable'],
  ['inert', 'makes the whole host non-interactive and hides it from assistive technology'],
  ['popover', 'turns the host into a popover, which the user-agent stylesheet hides until it is shown'],
  ['role', 'changes what assistive technology announces the host as, often giving two elements one role'],
]);

/** Tags a selector can name that never reach the DOM as an element. */
const NOT_ELEMENTS = new Set(['ng-template', 'ng-container', 'ng-content']);

/**
 * Every input whose public name is an HTML global attribute with a visible
 * effect, on a component whose host has no binding for that attribute — as one
 * sentence each. An empty array is a pass.
 *
 * ```ts
 * it('keeps a static title off the host', async () => {
 *   expect(await globalAttributeInputs({ packageDir: 'dist' })).toEqual([]);
 * });
 * ```
 *
 * ## The question
 *
 * A template that writes an attribute STATICALLY — `<wr-result-404 title="Lost?">`
 * — sets the input of that name and also leaves the attribute on the element.
 * Angular has always done both, and for most names the second half is
 * invisible. For `title` it is the browser's own tooltip hovering over the
 * whole component; for `id` it is a `<label for>` that lands on the host rather
 * than on the input inside it; for `hidden` or `popover` it is a component that
 * vanishes. The compiler accepts it, the input receives its value, and nothing
 * says a word until somebody hovers. A bound `[title]="…"` sets only the input,
 * which is why the defect survives a test suite that binds everything.
 *
 * The fix is one host binding, `'[attr.title]': 'null'`. It runs after the
 * static attribute is written, and binding `null` removes it.
 *
 * The question is old and keeps being asked. It has been open against Angular
 * since 2018 ({@link https://github.com/angular/angular/issues/24376 | angular/angular#24376}),
 * and angular-eslint was asked for an input twin of `no-output-native` that was
 * never built ({@link https://github.com/angular-eslint/angular-eslint/issues/320 | angular-eslint/angular-eslint#320}).
 * It reaches real libraries: candor shipped the tooltip on four components
 * ({@link https://github.com/pawn002/candor/issues/78 | pawn002/candor#78}), and ngwr
 * moved `id` off three control hosts as a breaking change
 * ({@link https://github.com/thekhegay/ngwr/commit/98629b82ac19ff17bd90e57c47a3824ef64cb340 | 98629b82})
 * and then `title` off ten more
 * ({@link https://github.com/thekhegay/ngwr/commit/6fa38c20a4fac8dd6be6d3868b2fbc2839d470b8 | 6fa38c20}) —
 * a sweep by hand that missed the three result presets, which this finds.
 *
 * ## How it reads the package
 *
 * From the partial declarations — the `ɵɵngDeclareComponent` and
 * `ɵɵngDeclareDirective` calls every published Angular library carries — read
 * with the TypeScript parser, starting from each JavaScript file `exports`
 * reaches and following relative imports from there. A component's input
 * surface is merged the way Angular merges it at runtime:
 *
 * - its own inputs and host bindings;
 * - the inputs its `hostDirectives` EXPOSE, under the alias the host gives them;
 *   the inputs THOSE directives expose from host directives of their own, which
 *   Angular applies to the same element under the names the middle declaration
 *   gives them, at any depth; and every host binding along the way;
 * - everything a base class contributes — inputs, host bindings, host
 *   directives — when the base is in this package, followed through its own
 *   `extends` in turn, across files and across entry points.
 *
 * Names are compared lowercased. An input called `tabIndex`, written statically
 * as `tabIndex="0"`, sets the input and lands on the element as `tabindex`,
 * because HTML attribute names are case-insensitive.
 *
 * Only a property binding counts as the fix — `[attr.title]`, or the DOM
 * property `[title]`. A STATIC host attribute does not: `host: { title: '' }`
 * loses to the same attribute written in a template, since Angular merges the
 * template's attributes last.
 *
 * ## Which attributes, and why these
 *
 * The list is chosen by what the attribute does to an element the consumer
 * never meant to give it, not copied from the spec's list of global attributes:
 *
 * | Attribute | On the host, it… |
 * | --- | --- |
 * | `title` | draws a native tooltip over the whole component |
 * | `id` | gives the HOST the id, so `<label for>`, fragment links and `getElementById` find the wrong element — and two share it when the component forwards it |
 * | `hidden` | hides the host through the user-agent `[hidden]` rule, unless a host style sets `display` |
 * | `lang` | re-languages the subtree: hyphenation, quotes, font fallback, screen-reader voice |
 * | `dir` | flips the direction, and the layout, of the subtree |
 * | `tabindex` | makes the host focusable — an extra tab stop or click target |
 * | `accesskey` | binds the shortcut to the host, in front of the inner control |
 * | `draggable` | makes the host a native drag source (for `"true"`) |
 * | `spellcheck` | reaches every editable element inside, by inheritance |
 * | `contenteditable` | makes the whole host editable |
 * | `inert` | disables the host and hides it from assistive technology |
 * | `popover` | turns the host into a popover, hidden until shown |
 * | `role` | changes what assistive technology announces the host as |
 *
 * `role` is ARIA rather than HTML, and HTML allows it on every element; it is
 * here because its effect is exactly this class of defect, heard rather than
 * seen.
 *
 * Left out, each for a reason:
 *
 * - `autofocus` — honoured only on a focusable element, and a host is not one
 *   unless something gives it a `tabindex`, which this list covers. ngwr carries
 *   four `autoFocus` inputs; flagging them would be noise.
 * - `class` and `style` — Angular merges both into the host on purpose; they are
 *   how a consumer styles a host, and an invalid `style` value is dropped by
 *   the browser.
 * - `translate` — changes nothing until a translation tool runs, and then only
 *   for `"no"`.
 * - `autocapitalize`, `autocorrect`, `enterkeyhint`, `inputmode` and
 *   `writingsuggestions` — they steer the keyboard or the suggestions of an
 *   editable element, and a host is not editable unless `contenteditable` makes
 *   it so, which is on the list.
 * - `slot`, `part` and `exportparts` — they matter only around a shadow root.
 * - `is`, `nonce`, the microdata attributes and `data-*` — no effect on how the
 *   element renders or behaves.
 * - `aria-*` — what each does depends on the host's role, which this cannot
 *   see, and an input named `ariaLabel` written statically lands as `arialabel`,
 *   which does nothing at all. An input whose public name is literally
 *   `aria-label` is the case left to a reviewer.
 * - Inline event handlers (`onclick` and the rest) — a security question rather
 *   than a layout one, and Angular already refuses a binding to them.
 *
 * ## What it does not check
 *
 * **Whether anyone writes the attribute statically.** A consumer's templates are
 * not in the package. The finding is that the host would carry the attribute
 * if they did, which a published component cannot rule out.
 *
 * **The value of the binding.** `'[attr.title]': 'null'` removes the attribute;
 * `'[title]': 'null'` writes the text "null" into it. Both take the attribute
 * away from the consumer, and both count; which value is right is a reviewer's
 * call.
 *
 * **A component that means the attribute to stay**, or removes it in code
 * through `Renderer2` where no declaration shows it. Neither is visible here,
 * and `ignore` is for both.
 *
 * **A host that is a native element.** A selector that names no custom element
 * — `[wrTooltip]`, `button[wr-btn]` — puts the declaration on an element the
 * consumer chose, where the attribute's native meaning may be exactly what they
 * want. Such declarations are skipped. One that names a custom element anywhere
 * in its selector list is checked, directive or component alike.
 *
 * **A base class from another package is REPORTED, not passed.** Its inputs
 * become the subclass's own, and they cannot be read from here, so the class is
 * named as not fully checked. The same goes for a base the reader cannot follow
 * to a class — a mixin call, say.
 *
 * **A host directive from another package is REPORTED, and its aliases are
 * still checked.** The names a host exposes from it are written in the host's
 * own declaration, so a directive from elsewhere exposed as `title` is found
 * like any other; its host bindings cannot be read, so that finding may
 * describe an attribute the directive already removes, and says so. What
 * cannot be read at all is the directive's OWN `hostDirectives`: Angular applies
 * those to this host as well, under names only that package declares, so a
 * static attribute can reach an input nobody in this package named. A host
 * directive the reader cannot follow to a declaration is reported the same way.
 *
 * **Full compilation.** An application build emits `ɵɵdefineComponent`, which
 * this does not read. A package with no partial declaration on a custom element
 * gets one finding saying nothing was checked, rather than an empty array.
 *
 * **Two classes with one name** share a finding and an `ignore` entry. A package
 * that ships the same class in two builds — an `esm2022` and a `fesm2022` copy
 * — is reported once for it, which is the reason findings are keyed that way.
 *
 * **`typescript` has to be installed.** It is an optional peer of ngtrue,
 * needed by this function, by `unresolvableTypes` and by `unexportedTypes`; a
 * repository building an Angular library has it already, and one without it
 * gets an error saying so rather than a pass.
 *
 * @since 0.2.0
 */
export async function globalAttributeInputs(options: GlobalAttributeInputsOptions): Promise<readonly string[]> {
  const ts = await loadTypeScript(
    'globalAttributeInputs',
    'It reads the partial declarations with the TypeScript parser, because a bundler reformats the object ' +
      'literal they are written in, and a pattern that matched the packages it was tried on would miss the next one silently.',
  );
  const packageDir = resolve(options.packageDir);
  const manifest = readManifest(packageDir);

  if (exportTargets(manifest).length === 0) {
    return [
      'the manifest declares no `exports`, so there is no list of files a consumer can load and nothing ' +
        'was read. Add an `exports` map, or point `packageDir` at the built package that has one.',
    ];
  }

  const reader = new PartialDeclarationReader(ts, packageDir, manifest);
  const modules = reader.read();
  const declarations = modules.flatMap(module => module.declarations);
  const checked = declarations.filter(declaration => namesCustomElement(declaration.selector));

  if (checked.length === 0) {
    return [
      `read ${String(modules.length)} JavaScript file(s) reachable from \`exports\` and found ` +
        `${String(declarations.length)} partial declaration(s), none of them on a custom element — so nothing ` +
        'was checked. A package compiled in full mode carries `ɵɵdefineComponent` rather than ' +
        '`ɵɵngDeclareComponent`, and is not in the form a library is published in.',
    ];
  }

  const surfaces = new SurfaceReader(reader);
  const findings = new Map<string, string[]>();
  const report = (key: string, message: string): void => {
    const list = findings.get(key) ?? [];
    if (!list.includes(message)) list.push(message);
    findings.set(key, list);
  };

  for (const declaration of checked) {
    const where = `${declaration.className} (selector "${declaration.selector ?? ''}", ${declaration.file})`;
    const surface = surfaces.of(declaration);

    for (const gap of surface.gaps) {
      report(
        declaration.className,
        `${where} was not fully checked: ${gap}. Check its inputs by hand, then add "${declaration.className}" to ignore.`,
      );
    }

    for (const input of [...surface.own, ...surface.exposed]) {
      const attribute = input.name.toLowerCase();
      const effect = ATTRIBUTES.get(attribute);
      if (effect === undefined) continue;
      if (surface.bound.has(`attr.${attribute}`) || surface.bound.has(attribute)) continue;
      const key = `${declaration.className}.${input.name}`;
      if (findings.has(key)) continue;
      const spelled = input.name === attribute ? '' : ` (the attribute ${attribute}: HTML attribute names ignore case)`;
      report(
        key,
        `${where} has an input "${input.name}"${spelled}${input.via}, and nothing binds [attr.${attribute}] on its ` +
          `host: a static ${attribute}="…" sets the input and stays on the host element, where it ${effect}.`,
      );
    }
  }

  const problems: string[] = [];
  const ignored = new Set(options.ignore ?? []);
  const keys = [...findings.keys()].sort();
  for (const key of keys) {
    if (ignored.delete(key)) continue;
    problems.push(...(findings.get(key) as string[]));
  }
  for (const stale of ignored) {
    // A bare class name next to that class's input findings is the likeliest
    // misreading of `ignore`, and "the class is gone" would be false about it.
    const inputs = keys.filter(key => key.startsWith(`${stale}.`) && !(options.ignore ?? []).includes(key));
    problems.push(
      inputs.length > 0
        ? `ignore lists "${stale}", which accepts only an incomplete check, and ${stale} was checked completely. ` +
            `To accept an input, list it by name: ${inputs.map(key => `"${key}"`).join(', ')}.`
        : `ignore lists "${stale}", which matches no finding — the class or the input is gone, renamed or ` +
            'already fixed, so the entry can go.',
    );
  }
  return problems;
}

/** An input a static attribute on the host reaches, and how it got there. */
interface Reached {
  readonly name: string;
  /** Empty for the class's own input; otherwise a clause starting with a space. */
  readonly via: string;
}

/**
 * What a declaration exposes to a template and binds on its host, inheritance
 * and host directives included.
 *
 * `own` and `exposed` are kept apart because they travel differently. Used as a
 * host directive, a declaration's OWN inputs reach the host only under the
 * names the host gives them, which the host's declaration states. What IT
 * exposes from host directives of its own reaches the host unasked: Angular
 * applies a host directive's host directives to the same element, under the
 * names the middle declaration gave them (`findHostDirectiveDefs` recurses with
 * each level's own mapping). Measured rather than read off the source: a host
 * written `<x-outer title="Lost?">`, whose host directive exposed an inner
 * directive's input as `title`, set that input and kept the attribute. Merging
 * the two would either flag a host directive's private inputs or lose the
 * second hop, and losing it is a leak this check would answer `[]` for.
 */
interface Surface {
  /** The declaration's inputs and those of its bases. */
  readonly own: readonly Reached[];
  /** Inputs its host directives expose, at every depth, its bases' included. */
  readonly exposed: readonly Reached[];
  /** Host property-binding keys, lowercased. */
  readonly bound: ReadonlySet<string>;
  /** Sentences naming what could not be read. */
  readonly gaps: readonly string[];
}

interface MutableSurface {
  readonly own: Reached[];
  readonly exposed: Reached[];
  readonly bound: Set<string>;
  readonly gaps: string[];
}

const EMPTY: Surface = { own: [], exposed: [], bound: new Set(), gaps: [] };

class SurfaceReader {
  readonly #reader: PartialDeclarationReader;
  readonly #done = new Map<PartialDeclaration, Surface>();
  readonly #open = new Set<PartialDeclaration>();

  constructor(reader: PartialDeclarationReader) {
    this.#reader = reader;
  }

  of(declaration: PartialDeclaration): Surface {
    const done = this.#done.get(declaration);
    if (done !== undefined) return done;
    // A cycle is a compile error in Angular, so this only guards the reader.
    if (this.#open.has(declaration)) return EMPTY;
    this.#open.add(declaration);

    const name = declaration.className;
    const surface: MutableSurface = { own: [], exposed: [], bound: new Set(declaration.hostProperties), gaps: [] };

    if (declaration.inputs === null) {
      surface.gaps.push(`the inputs in ${name}'s partial declaration are written in a form this check cannot read`);
    } else {
      for (const input of declaration.inputs) surface.own.push({ name: input, via: '' });
    }

    if (declaration.hostDirectives === null) {
      surface.gaps.push(
        `the host directives in ${name}'s partial declaration are written in a form this check cannot read`,
      );
    } else {
      for (const use of declaration.hostDirectives) this.#hostDirective(declaration, use, surface);
    }

    this.#inherit(declaration, surface);

    this.#open.delete(declaration);
    this.#done.set(declaration, surface);
    return surface;
  }

  /**
   * One `hostDirectives` entry: the names the host exposes from it, everything
   * it exposes from host directives of its own, and its host bindings.
   *
   * A directive this package does not hold is REPORTED as well as checked by
   * its aliases. The aliases are in the host's own declaration and are honest
   * to check; what the directive's package declares — the host directives it
   * applies to this host and the names it exposes them under — is not, and that
   * is a route a static attribute takes as surely as the host's own inputs.
   */
  #hostDirective(declaration: PartialDeclaration, use: HostDirectiveUse, into: MutableSurface): void {
    const owner = declaration.className;
    const target = this.#reader.resolve(declaration.module, use.expression);

    if (target.kind === 'class' && target.declaration !== null) {
      const applied = this.of(target.declaration);
      const via = ` exposed from the host directive ${target.name}`;
      for (const exposed of use.exposed) into.exposed.push({ name: exposed, via });
      for (const input of applied.exposed) {
        into.exposed.push({ name: input.name, via: `${input.via} through the host directive ${target.name}` });
      }
      for (const key of applied.bound) into.bound.add(key);
      into.gaps.push(...applied.gaps);
      return;
    }

    const from = target.kind === 'external' ? ` from ${target.specifier}` : '';
    const via = ` exposed from the host directive ${target.name}${from}, whose host bindings this check could not read`;
    for (const exposed of use.exposed) into.exposed.push({ name: exposed, via });
    into.gaps.push(
      target.kind === 'external'
        ? `${owner} uses the host directive ${target.name} from ${target.specifier}, and any host directives of ` +
            'its own land on this host under names only that package declares — those cannot be read from this one'
        : `${owner} uses the host directive ${target.name}, which could not be followed to a declaration, so ` +
            'neither its host bindings nor any host directives of its own could be read',
    );
  }

  /**
   * Walk the `extends` chain the way `ɵɵInheritDefinitionFeature` does: a base
   * with a declaration contributes its whole surface, which already includes
   * ITS bases; a plain class contributes nothing and is walked through. Host
   * directives are inherited with the rest (their feature is marked
   * `ngInherit`), so a base's exposed inputs stay exposed in the subclass.
   */
  #inherit(declaration: PartialDeclaration, into: MutableSurface): void {
    let node = declaration.classNode;
    let module = declaration.module;
    let owner = declaration.className;

    if (node === null) {
      if (declaration.usesInheritance) {
        into.gaps.push(`${owner} extends a class, and the class behind its partial declaration could not be located`);
      }
      return;
    }

    for (let base = this.#reader.baseOf(node); base !== undefined;) {
      const target = this.#reader.resolve(module, base);
      if (target.kind === 'external') {
        into.gaps.push(
          `${owner} extends ${target.name} from ${target.specifier}, and a base class's inputs become its ` +
            "subclass's own — those of a class in another package cannot be read from this one",
        );
        return;
      }
      if (target.kind === 'unresolved') {
        into.gaps.push(`${owner} extends ${target.name}, which could not be followed to a class`);
        return;
      }
      if (target.declaration !== null) {
        const inherited = this.of(target.declaration);
        const through = (input: Reached): Reached => ({
          name: input.name,
          via: input.via === '' ? ` inherited from ${target.name}` : `${input.via} through ${target.name}`,
        });
        into.own.push(...inherited.own.map(through));
        into.exposed.push(...inherited.exposed.map(through));
        for (const key of inherited.bound) into.bound.add(key);
        into.gaps.push(...inherited.gaps);
        return;
      }
      node = target.node;
      module = target.module;
      owner = target.name;
      base = this.#reader.baseOf(node);
    }
  }
}

/**
 * Whether any selector in the list names a custom element.
 *
 * Custom element names must contain a hyphen and no built-in element's does,
 * which makes this the honest line between a host nobody asked to carry the
 * attribute and an element the consumer chose. `ng-template` and friends have
 * the hyphen and never become an element.
 */
function namesCustomElement(selector: string | null): boolean {
  if (selector === null) return false;
  return selector.split(',').some(part => {
    const tag = /^\s*([a-zA-Z][\w-]*)/.exec(part)?.[1]?.toLowerCase();
    return tag !== undefined && tag.includes('-') && !NOT_ELEMENTS.has(tag);
  });
}
