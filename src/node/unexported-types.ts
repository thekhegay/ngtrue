import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import type * as TS from 'typescript';

import { exportTargets, readManifest, type ExportTarget } from './manifest.js';
import { loadTypeScript, stageProbe, type TypeScript } from './probe.js';

/**
 * Options for {@link unexportedTypes}.
 *
 * @since 0.2.0
 */
export interface UnexportedTypesOptions {
  /** The directory holding the `package.json` to check — the BUILT package, whose declarations a consumer reads. */
  readonly packageDir: string;
  /**
   * Findings that are decisions rather than defects, each spelled one of two
   * ways.
   *
   * - **A declaration's name**, exactly as a finding prints it, for a type that
   *   is meant to stay unnameable — a brand, a base class the package does not
   *   want subclassed from outside. It exempts that declaration wherever a
   *   public signature names it, and every other unexported declaration that
   *   happens to share the name. A name that does not resolve at all cannot be
   *   exempted: a declaration file that is missing is not a decision.
   * - **A subpath**, spelled as it is in `exports` (`"./schematics/*"`), to
   *   acknowledge that a wildcard cannot be read, or that a subpath does not
   *   load as declarations on purpose.
   *
   * An entry that exempts nothing is reported. An exemption list is a claim
   * about the package, and one that outlived the thing it excused says
   * something false the next time somebody reads it.
   */
  readonly ignore?: readonly string[];
}

/**
 * Every public member whose type names a declaration that no subpath of the
 * package exports, as one sentence each. An empty array is a pass.
 *
 * ```ts
 * it('exports every type its public signatures name', async () => {
 *   expect(await unexportedTypes({ packageDir: 'dist' })).toEqual([]);
 * });
 * ```
 *
 * A finding reads
 * `ngwr/sidebar: WrSidebarItem.activeOptions names WrSidebarActiveOptions, which no subpath exports.`
 * — the consumer can bind that input and cannot write down its type. They
 * cannot annotate a field that holds it, so the field's type is inferred, and
 * in a library of their own TypeScript then has to print it into a `.d.ts` and
 * fails with TS2883 under pnpm, where the only path to the declaration is
 * inside the virtual store. TypeScript itself never reports any of this on the
 * package that causes it: a declaration file naming a type it does not export
 * is perfectly valid, and the error lands in somebody else's build.
 *
 * ## Provenance
 *
 * In ngwr it happened twice before this existed.
 * [39b2f4ac](https://github.com/thekhegay/ngwr/commit/39b2f4ac) re-exported
 * `WrButtonShape`, which `WrButton`'s `shape` input had been typed with while
 * the entry point never exported it.
 * [c4f4c94c](https://github.com/thekhegay/ngwr/commit/c4f4c94c) did the same
 * for five more — `WrAvatarShape`, `WrBadgeShape`, `WrDividerAlign`,
 * `WrPaginationSize` and `WrPaginationShape`, across four entry points —
 * riding along in a commit about stylesheets, because nothing had been
 * looking. Run over ngwr 14.11.0's build, this found two that were still live:
 * `WrSidebarItem.activeOptions` and `WrSelect.registerOption`. Outside it,
 * [telerik/kendo-angular#4982](https://github.com/telerik/kendo-angular/issues/4982)
 * (`PopupSettings.collision` typed with a `Collision` the package did not
 * export) and
 * [storybookjs/storybook#27425](https://github.com/storybookjs/storybook/issues/27425)
 * (`TransformComponentType`, not importable from `@storybook/angular`) are the
 * same question filed by consumers who hit it.
 *
 * ## How it answers
 *
 * Every literal subpath is imported from a throwaway package that has this one
 * symlinked into `node_modules` — the probe `unresolvableTypes` uses — and the
 * whole set goes into ONE TypeScript program, so the checker resolves each
 * import exactly as a consumer's compiler would, through `exports`, to the
 * bundled declaration file they actually get. What every subpath exports is
 * then unioned before anything is judged. That union is the reason this is not
 * API Extractor's `ae-forgotten-export`, which asks the same question one
 * entry point at a time and so reports a type that a SIBLING subpath exports —
 * in a library with two hundred entry points, nearly every shared type.
 *
 * For each exported class, interface, type alias, function and variable, it
 * reads the types written in its public signatures — members, parameters,
 * return types, type arguments, `typeof` queries, `import('…')` types,
 * `extends` clauses — and asks the checker what each name resolves to. A name
 * is a finding when it resolves to a declaration inside this package that no
 * subpath exports. A name that resolves into `node_modules` is someone else's
 * surface and is not judged, and one declared globally (`declare global`, a
 * script file, an ambient `declare module`) needs no export to be named.
 *
 * A name that resolves to NOTHING is a finding too, when the package's own
 * specifier brought it in — a relative one, or the package's own name: `import
 * { BtnShape } from './types.js'` where the build stopped emitting
 * `types.d.ts`, or emitted a stale one without `BtnShape` in it. The checker
 * gives such a name the error type, which a consumer under `skipLibCheck` reads
 * as `any` without a word, and without it reads as an error in a file they did
 * not write. Skipping it would answer exactly as for the package that shipped
 * the file, and no other check here would notice: the subpath itself resolves.
 * `ignore` does not reach these, since a missing declaration is never a
 * decision. A name that does not resolve and came from anywhere else — a
 * dependency that is not installed, a global from an `@types` package the
 * program cannot see — is skipped, because nothing from a dependency is judged
 * whether it resolves or not.
 *
 * Skipped, each because a consumer is not promised it or never meets it:
 * `private` and `#private` members; `protected` members, which in an Angular
 * library are template state far more often than an extension point (ngwr's
 * `protected readonly resolvedShape`); members and declarations tagged
 * `@internal`; names starting with `ɵ`, which is Angular's own marker for
 * private API and covers every `ɵcmp` and `ɵfac` the compiler emits;
 * `implements` clauses, since a class re-declares every member an interface
 * promises and the interface's name is never needed to use it; and the operand
 * of `keyof`, whose result is a union of literal keys with no name left in it.
 * A type exported under an alias whose whole body is a bare reference —
 * `export type A = B` — makes `B` nameable as `A`, and is counted that way.
 *
 * A finding about a declaration tagged `@internal` says so, because there the
 * usual fix is the other way round: the member naming it is the one that
 * escaped, and it wants the tag too. An `extends` clause naming an `@internal`
 * base is not a finding at all — a public subclass of a private base is an
 * ordinary shape, and the tag already records the decision.
 *
 * ## What it does not check
 *
 * **Whether a type is MEANT to be unnameable.** A brand type, or a base class
 * kept private on purpose without an `@internal` tag, is reported like an
 * oversight, because the declaration file says the same thing in both cases.
 * That is what `ignore` is for, and the entry it takes is the record of the
 * decision.
 *
 * **Types the compiler inlined.** Where a type was inferred and the compiler
 * wrote out its structure instead of a name — `Signal<{ open: boolean }>`
 * rather than `Signal<PanelState>` — there is nothing to resolve. Only names
 * that appear in the declaration files are read, so an unexported type that
 * reached them only as structure is invisible here.
 *
 * **A type that only a DEPENDENCY exports** (the kendo case: the declaration is
 * exported by `@progress/kendo-angular-popup`, and the tooltip package that
 * names it does not re-export it). Declarations in `node_modules` are skipped
 * entirely; whether a dependency's type should be re-exported is a judgement
 * about which packages a consumer is expected to install, and the declaration
 * files cannot settle it.
 *
 * **Members inherited from a base that is not exported.** The `extends` clause
 * itself is reported, unless the base is `@internal`; either way the base's own
 * members are read only once it is exported and becomes a subject in its own
 * right, so a public member a subclass inherits from a private base is not
 * read at all. A mixin base, which `tsc` writes as a `declare const Btn_base`
 * beside the class, is the same case under a generated name: `Btn extends
 * Btn_base` is reported, and nothing in that constant's annotation is read.
 *
 * **Protected members, for a library that means them.** Where a `protected`
 * member is an extension point, a subclass in the consumer's code does meet its
 * types, and an unexported one there goes unreported.
 *
 * **A declaration `stripInternal` removed while a public member still names
 * it.** In a bundled declaration file the name is then local and declared
 * nowhere, which is indistinguishable here from a global the program cannot
 * see — `NodeJS.Timeout` with no `@types/node` installed, since TypeScript
 * stopped writing `/// <reference types>` for those in 5.5 — so it is skipped
 * rather than reported. Where the stripped declaration sat in a separate file
 * and was imported, it is caught as a name that does not resolve.
 *
 * **Wildcard subpaths.** Each stands for an open set, so its exports are not
 * counted, and a type exported ONLY through one would be reported as exported
 * by no subpath. The wildcard is reported alongside, so that reading cannot be
 * mistaken for a clean one.
 *
 * **Any resolution mode but `bundler`.** That is the one an Angular
 * application compiles under. Whether a subpath resolves at all, and the same
 * under `node16`, is `unresolvableTypes`'s question; a subpath that does not
 * load here is reported rather than read, because its exports going uncounted
 * would turn into findings against every type it exports.
 *
 * Subpaths that are not code — a `sass` or `style` condition, a `.json` or
 * `.scss` target — are left out without a word: no import of them can carry a
 * type, so there is nothing to read or to count.
 *
 * A run that read nothing says so rather than returning an empty array: a
 * package whose every subpath is a stylesheet, a wildcard or a file that does
 * not load, and one whose subpaths load but export nothing of its own to read.
 * That holds when `ignore` acknowledged every one of those subpaths, too —
 * acknowledging a subpath excuses the line about it, and does not turn
 * "nothing was read" into "nothing was wrong".
 *
 * `typescript` has to be installed. It is an optional peer of ngtrue, and this,
 * `unresolvableTypes` and `globalAttributeInputs` are the three functions that
 * load it; without it this throws rather than passing.
 *
 * @since 0.2.0
 */
export async function unexportedTypes(options: UnexportedTypesOptions): Promise<readonly string[]> {
  const ts = await loadTypeScript(
    'unexportedTypes',
    'It asks the real type checker what each public signature names, which is the only way to know ' +
      'what a name resolves to across files and entry points.',
  );
  const packageDir = resolve(options.packageDir);
  const manifest = readManifest(packageDir);

  const name = manifest.name;
  if (typeof name !== 'string' || name.length === 0) {
    return [`${packageDir}/package.json has no "name", so nothing can import it by a package specifier.`];
  }

  const targets = exportTargets(manifest);
  if (targets.length === 0) {
    return [
      'the manifest declares no `exports`, so every file in the package is importable by its path and ' +
        '"exported by no subpath" describes nothing. Add an `exports` map before asking this question.',
    ];
  }

  const ignored = new Set(options.ignore ?? []);
  const used = new Set<string>();
  const problems: string[] = [];

  const specifiers: { readonly subpath: string; readonly specifier: string }[] = [];
  for (const subpath of codeSubpaths(targets)) {
    if (subpath.includes('*')) {
      if (ignored.has(subpath)) {
        used.add(subpath);
        continue;
      }
      problems.push(
        `exports["${subpath}"] is a wildcard and was not read — nothing it exports was counted, so a type ` +
          'exported only through it is reported as exported by no subpath. List its subpaths literally, ' +
          'or acknowledge it in `ignore`.',
      );
      continue;
    }
    specifiers.push({ subpath, specifier: subpath === '.' ? name : `${name}/${subpath.slice(2)}` });
  }

  let loaded = 0;
  if (specifiers.length > 0) {
    const source = specifiers.map((entry, i) => `import * as m${String(i)} from ${JSON.stringify(entry.specifier)};`);
    const probe = stageProbe(name, packageDir, `${source.join('\n')}\n`);
    try {
      const result = read(ts, probe.containingFile, realpathSync(packageDir), name, specifiers, ignored, used);
      problems.push(...result.problems);
      loaded = result.loaded;
    } finally {
      probe.dispose();
    }
  }

  if (loaded === 0) {
    // Not a pass, and `ignore` cannot make it one. Every line above may have
    // been acknowledged, and what is left is still a run that read no
    // declaration file: an empty array here would say every signature checked
    // out when none was looked at.
    problems.push(
      'no subpath was read — each one is blocked, a stylesheet or data file, a wildcard, or does not load ' +
        'as declarations under bundler — so there were no signatures to check.',
    );
  }

  for (const entry of ignored) {
    if (used.has(entry)) continue;
    problems.push(
      entry === '.' || entry.startsWith('./')
        ? `ignore lists "${entry}", which is not a subpath this check skipped — the entry exempts nothing.`
        : `ignore lists "${entry}", and no public signature names an unexported declaration by that name — the entry exempts nothing.`,
    );
  }

  return problems;
}

/** One exported declaration, under the name and the subpath a consumer reaches it by. */
interface Subject {
  readonly specifier: string;
  readonly label: string;
  readonly symbol: TS.Symbol;
}

function read(
  ts: TypeScript,
  probeFile: string,
  packageRoot: string,
  packageName: string,
  specifiers: readonly { readonly subpath: string; readonly specifier: string }[],
  ignored: ReadonlySet<string>,
  used: Set<string>,
): { readonly problems: readonly string[]; readonly loaded: number } {
  const program = ts.createProgram({
    rootNames: [probeFile],
    // `bundler` because it is what an Angular application compiles under, and
    // `allowJs` off so a subpath with no declarations behind it fails to load
    // instead of loading as JavaScript, whose inferred exports would then be
    // counted as if somebody had declared them. `types: []` keeps whatever
    // `@types` happen to sit above the temp directory out of the program.
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      allowJs: false,
      types: [],
    },
  });
  const checker = program.getTypeChecker();
  const probe = program.getSourceFile(probeFile);
  if (probe === undefined) throw new Error(`ngtrue: the probe file ${probeFile} did not enter its own program.`);
  const imports = probe.statements.filter(ts.isImportDeclaration);

  const problems: string[] = [];

  const inPackage = (file: TS.SourceFile): boolean => {
    const path = relative(packageRoot, resolve(file.fileName));
    return path !== '' && !path.startsWith('..') && !isAbsolute(path) && !path.split(sep).includes('node_modules');
  };

  const target = (symbol: TS.Symbol): TS.Symbol =>
    symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;

  // ── What the subpaths export, unioned before anything is judged ──────────
  const exported = new Set<TS.Node>();
  const subjects: Subject[] = [];
  const seen = new Set<TS.Symbol>();

  const collect = (specifier: string, container: TS.Symbol, prefix: string): void => {
    for (const exportSymbol of checker.getExportsOfModule(container)) {
      const symbol = target(exportSymbol);
      const declarations = symbol.declarations ?? [];
      if (declarations.length === 0) continue; // an unresolved re-export: nothing to count or to read
      for (const declaration of declarations) exported.add(declaration);

      const label = `${prefix}${exportSymbol.getName()}`;
      if (seen.has(symbol)) continue;
      seen.add(symbol);
      subjects.push({ specifier, label, symbol });

      if (symbol.flags & ts.SymbolFlags.Enum) {
        symbol.exports?.forEach(member => member.declarations?.forEach(d => exported.add(d)));
      }
      if (symbol.flags & ts.SymbolFlags.Module) collect(specifier, symbol, `${label}.`);
      for (const declaration of declarations) {
        // `export type A = B` makes B nameable, as A. Only a bare reference
        // counts: `A = B<string>` or `A<T> = B<T>` is a different type.
        if (
          ts.isTypeAliasDeclaration(declaration) &&
          declaration.typeParameters === undefined &&
          ts.isTypeReferenceNode(declaration.type) &&
          declaration.type.typeArguments === undefined
        ) {
          const aliased = checker.getSymbolAtLocation(declaration.type.typeName);
          for (const d of (aliased && target(aliased).declarations) ?? []) exported.add(d);
        }
      }
    }
  };

  let loaded = 0;
  specifiers.forEach((entry, i) => {
    const statement = imports[i];
    const module = statement === undefined ? undefined : checker.getSymbolAtLocation(statement.moduleSpecifier);
    const file = module?.declarations?.find(ts.isSourceFile);
    if (module === undefined || file === undefined || !file.isDeclarationFile) {
      if (ignored.has(entry.subpath)) {
        used.add(entry.subpath);
        return;
      }
      problems.push(
        `${entry.specifier} did not load as declarations under bundler, so nothing it exports was counted ` +
          'or read. `unresolvableTypes` says why.',
      );
      return;
    }
    loaded++;
    collect(entry.specifier, module, '');
  });

  // ── What the exported declarations name ──────────────────────────────────
  const reported = new Set<string>();
  const report = (sentence: string): void => {
    if (reported.has(sentence)) return;
    reported.add(sentence);
    problems.push(sentence);
  };

  /** A specifier that is the package's own: relative, or its name or a subpath of it. */
  const own = (literal: TS.Node | undefined): literal is TS.StringLiteral =>
    literal !== undefined &&
    ts.isStringLiteral(literal) &&
    (literal.text.startsWith('.') || literal.text === packageName || literal.text.startsWith(`${packageName}/`));

  /**
   * The specifier the leftmost name of `entity` was imported by — `T` in
   * `T.Foo`, `DEFAULTS` in `typeof DEFAULTS.shape` — or `undefined` when that
   * name is not an import binding.
   */
  const importedBy = (entity: TS.Node): TS.Expression | undefined => {
    let left = entity;
    while (ts.isQualifiedName(left) || ts.isPropertyAccessExpression(left)) {
      left = ts.isQualifiedName(left) ? left.left : left.expression;
    }
    const binding = checker.getSymbolAtLocation(left);
    if (binding === undefined || !(binding.flags & ts.SymbolFlags.Alias)) return undefined;
    for (let node: TS.Node | undefined = binding.declarations?.[0]; node !== undefined; node = node.parent) {
      if (ts.isImportDeclaration(node)) return node.moduleSpecifier;
      if (ts.isImportEqualsDeclaration(node)) {
        return ts.isExternalModuleReference(node.moduleReference) ? node.moduleReference.expression : undefined;
      }
    }
    return undefined;
  };

  /** A name the package's own specifier brought in, and nothing answered to. */
  const dangling = (text: string, literal: TS.StringLiteral, specifier: string, owner: string, verb: string): void => {
    const why =
      checker.getSymbolAtLocation(literal) === undefined
        ? `'${literal.text}' leads to no declaration file`
        : `'${literal.text}' exports nothing by that name`;
    report(`${specifier}: ${owner} ${verb} ${text}, which does not resolve — ${why}.`);
  };

  const check = (entity: TS.Node, specifier: string, owner: string, verb: 'names' | 'extends', via?: TS.Node): void => {
    const found = checker.getSymbolAtLocation(entity);
    if (found === undefined || (target(found).declarations ?? []).length === 0) {
      // Nothing answered to the name. When the package's own specifier brought
      // it in, that is a declaration file the build did not emit, or emitted
      // stale, and the consumer gets the error type in its place — reported,
      // because skipping it would answer as for the package that shipped the
      // file. From anywhere else it is a dependency that is not installed, or a
      // global the program cannot see, and nothing from there is judged.
      const literal = via ?? importedBy(entity);
      if (own(literal)) {
        dangling(entity.getText(), literal, specifier, owner, verb);
        return;
      }
      if (found === undefined) return;
    }
    let symbol = target(found);
    if (symbol.flags & ts.SymbolFlags.TypeParameter) return;
    if (symbol.flags & ts.SymbolFlags.EnumMember) {
      // `Direction.Up` is nameable exactly when `Direction` is.
      const parent = symbol.declarations?.[0]?.parent;
      const enumSymbol = parent && ts.isEnumDeclaration(parent) ? checker.getSymbolAtLocation(parent.name) : undefined;
      if (enumSymbol === undefined) return;
      symbol = enumSymbol;
    }
    const declarations = symbol.declarations ?? [];
    const owned = declarations.filter(
      d => isNamedDeclaration(ts, d) && inPackage(d.getSourceFile()) && !isGlobal(ts, d),
    );
    if (owned.length === 0) {
      // `typeof DEFAULTS.shape` resolves to a PROPERTY, which is not something
      // anyone imports — the name a consumer would need is the one on the left.
      if (ts.isQualifiedName(entity)) check(entity.left, specifier, owner, verb);
      else if (ts.isPropertyAccessExpression(entity)) check(entity.expression, specifier, owner, verb);
      return;
    }
    if (declarations.some(d => exported.has(d))) return;

    const internal = owned.some(d => isInternal(ts, d));
    // A public class extending an `@internal` base is an ordinary shape, not a
    // contradiction: the tag is the decision, and the subclass is what a
    // consumer uses. ngwr's date-picker harnesses share a base this way.
    if (verb === 'extends' && internal) return;

    const name = qualifiedName(ts, owned[0] as TS.Node);
    if (ignored.has(name)) {
      used.add(name);
      return;
    }
    // A declaration tagged `@internal` was kept out of the exports on purpose,
    // so the fix is usually on the other side — the member naming it is the
    // one that escaped. ngwr's `WrSelect.registerOption` is that shape.
    report(
      internal
        ? `${specifier}: ${owner} ${verb} ${name}, which no subpath exports — ${name} is tagged @internal and ${owner} is not.`
        : `${specifier}: ${owner} ${verb} ${name}, which no subpath exports.`,
    );
  };

  const visit = (node: TS.Node, specifier: string, owner: string): void => {
    // `keyof X` is a union of X's keys, which are literals: nothing named in
    // the operand reaches a consumer, so nothing in it can be a finding. ngwr's
    // `WrCropArrow = keyof typeof ARROWS` is the case that settled it.
    if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.KeyOfKeyword) return;
    if (ts.isTypeReferenceNode(node)) check(node.typeName, specifier, owner, 'names');
    else if (ts.isTypeQueryNode(node)) check(node.exprName, specifier, owner, 'names');
    else if (ts.isImportTypeNode(node)) {
      // `import('./types.js').X` binds nothing, so the specifier travels with
      // the name: it is the only way to tell a missing file from a dependency.
      const literal = ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined;
      if (node.qualifier !== undefined) check(node.qualifier, specifier, owner, 'names', literal);
      else if (own(literal) && checker.getSymbolAtLocation(literal) === undefined) {
        dangling(node.getText(), literal, specifier, owner, 'names');
      }
    }
    ts.forEachChild(node, child => visit(child, specifier, owner));
  };

  let walked = 0;
  for (const subject of subjects) {
    if (subject.label.split('.').some(part => part.startsWith('ɵ'))) continue;
    for (const declaration of subject.symbol.declarations ?? []) {
      if (!inPackage(declaration.getSourceFile()) || isInternal(ts, declaration)) continue;
      const { specifier, label } = subject;

      if (ts.isClassDeclaration(declaration) || ts.isInterfaceDeclaration(declaration)) {
        walked++;
        declaration.typeParameters?.forEach(parameter => visit(parameter, specifier, label));
        for (const clause of declaration.heritageClauses ?? []) {
          if (clause.token === ts.SyntaxKind.ImplementsKeyword) continue;
          for (const base of clause.types) {
            check(base.expression, specifier, label, 'extends');
            base.typeArguments?.forEach(argument => visit(argument, specifier, label));
          }
        }
        const members: readonly TS.Node[] = declaration.members;
        for (const member of members) {
          if (!isPublic(ts, member)) continue;
          visit(member, specifier, memberLabel(ts, label, member));
        }
      } else if (
        ts.isTypeAliasDeclaration(declaration) ||
        ts.isFunctionDeclaration(declaration) ||
        ts.isVariableDeclaration(declaration)
      ) {
        walked++;
        visit(declaration, specifier, label);
      } else if (ts.isEnumDeclaration(declaration)) {
        // Read, and found to name nothing: an enum's members are values.
        walked++;
      }
      // A namespace, or a module re-exported whole (`export * as ns`), is not
      // counted: its members are subjects of their own, and a container whose
      // members are all skipped has had no signature read.
    }
  }

  if (loaded > 0 && walked === 0) {
    // Not a pass. An empty array would say every signature checked out, and
    // there were none to check.
    problems.push(
      "the subpaths that loaded export nothing this check reads — no declaration of the package's own that " +
        'is not `@internal` or `ɵ`-prefixed — so there were no signatures to read.',
    );
  }

  return { problems, loaded };
}

/**
 * Every subpath with at least one target an import could carry a type
 * through, sorted so `"."` comes first and owns whatever it exports.
 *
 * A target under a `sass` or `style` condition, or one ending in an extension
 * that is not script or declaration, is a stylesheet or a data file. No import
 * of it can name a type, so it neither exports anything nor needs reading. A
 * target with no extension at all (`"./schematics/*"`, a bare directory) might
 * be either, and is kept.
 */
function codeSubpaths(targets: readonly ExportTarget[]): readonly string[] {
  const code = targets.filter(
    ({ target, conditions }) =>
      target !== null &&
      !conditions.some(condition => STYLE_CONDITIONS.has(condition)) &&
      (CODE_EXTENSION.test(target) || !/\.[^/]*$/.test(target)),
  );
  return [...new Set(code.map(entry => entry.subpath))].sort();
}

const STYLE_CONDITIONS = new Set(['sass', 'style', 'css', 'scss', 'less', 'stylus']);
const CODE_EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/;

/** A declaration a consumer could import by name, if anything exported it. */
function isNamedDeclaration(ts: TypeScript, node: TS.Node): boolean {
  if (
    ts.isClassDeclaration(node) ||
    ts.isInterfaceDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isEnumDeclaration(node) ||
    ts.isFunctionDeclaration(node)
  ) {
    return node.name !== undefined;
  }
  if (ts.isModuleDeclaration(node)) return ts.isIdentifier(node.name);
  if (ts.isVariableDeclaration(node)) {
    // A module- or namespace-level `const`, which `typeof` can name. A
    // parameter or a destructured binding resolves here too, and is not one.
    const statement = node.parent.parent;
    return (
      ts.isIdentifier(node.name) &&
      ts.isVariableStatement(statement) &&
      (ts.isSourceFile(statement.parent) || ts.isModuleBlock(statement.parent))
    );
  }
  return false;
}

/**
 * Visible without an import: a script file, `declare global`, or an ambient
 * `declare module 'x'`. A consumer names those without the package exporting
 * them, so they cannot be findings.
 */
function isGlobal(ts: TypeScript, node: TS.Node): boolean {
  if (!ts.isExternalModule(node.getSourceFile())) return true;
  for (let current = node.parent; !ts.isSourceFile(current); current = current.parent) {
    if (
      ts.isModuleDeclaration(current) &&
      (ts.isStringLiteral(current.name) || current.flags & ts.NodeFlags.GlobalAugmentation)
    ) {
      return true;
    }
  }
  return false;
}

function isInternal(ts: TypeScript, node: TS.Node): boolean {
  return ts.getJSDocTags(node).some(tag => tag.tagName.text === 'internal');
}

function isPublic(ts: TypeScript, member: TS.Node): boolean {
  const name = (member as { readonly name?: TS.Node }).name;
  if (name !== undefined && ts.isPrivateIdentifier(name)) return false;
  if (name !== undefined && nameText(ts, name).startsWith('ɵ')) return false;
  if (ts.isClassElement(member) || ts.isTypeElement(member)) {
    const flags = ts.getCombinedModifierFlags(member);
    if (flags & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) return false;
  }
  return !isInternal(ts, member);
}

function memberLabel(ts: TypeScript, owner: string, member: TS.Node): string {
  if (ts.isConstructorDeclaration(member)) return `${owner}.constructor`;
  if (ts.isCallSignatureDeclaration(member)) return `${owner}()`;
  if (ts.isConstructSignatureDeclaration(member)) return `new ${owner}()`;
  if (ts.isIndexSignatureDeclaration(member)) return `${owner}[]`;
  const name = (member as { readonly name?: TS.Node }).name;
  return name === undefined ? owner : `${owner}.${nameText(ts, name)}`;
}

function nameText(ts: TypeScript, name: TS.Node): string {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return name.getText();
}

/** `Inner`, or `Outer.Inner` for a declaration inside a namespace. */
function qualifiedName(ts: TypeScript, declaration: TS.Node): string {
  const parts: string[] = [];
  const own = (declaration as { readonly name?: TS.Node }).name;
  if (own !== undefined) parts.push(nameText(ts, own));
  for (let current = declaration.parent; !ts.isSourceFile(current); current = current.parent) {
    if (ts.isModuleDeclaration(current) && ts.isIdentifier(current.name)) parts.unshift(current.name.text);
  }
  return parts.join('.');
}
