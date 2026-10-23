import { readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';

import type TS from 'typescript';

import { exportTargets, filesMatching, type ExportTarget, type Manifest } from './manifest.js';

/**
 * Reading what a published Angular library declares, from the JavaScript it
 * ships.
 *
 * A library is published in Angular's PARTIAL compilation form: each component
 * and directive carries an `ɵɵngDeclareComponent` / `ɵɵngDeclareDirective` call
 * whose single argument is an object literal describing it — selector, inputs,
 * host bindings, host directives — for the consumer's linker to turn into a
 * definition. That literal is the only place the compiled package still states
 * those facts as data, so it is what this reads.
 *
 * Read with the TypeScript parser and never with a regular expression. The
 * literal is emitted by a compiler and then reformatted by whatever bundled the
 * package, so its spacing, quoting and key order are not something a pattern
 * can rely on; a pattern that matched the packages it was tried on would miss
 * the next one silently, and a declaration a reader fails to see is a
 * declaration every rule built on it reports as fine.
 */

type Ts = typeof TS;
type ClassNode = TS.ClassDeclaration | TS.ClassExpression;

/** One component or directive, as its partial declaration describes it. */
export interface PartialDeclaration {
  readonly kind: 'component' | 'directive';
  /**
   * The class's own name. A bundler that renames the binding to avoid a
   * collision (`var WrFoo$1 = class WrFoo`) leaves this alone, so it is the name
   * the author wrote.
   */
  readonly className: string;
  /** The module it was found in, relative to the package, with `/` separators. */
  readonly file: string;
  /** `null` for an abstract directive, which no template can name. */
  readonly selector: string | null;
  /** Public input names — what a template writes, after any alias. `null` when the literal could not be read. */
  readonly inputs: readonly string[] | null;
  /** Host PROPERTY binding keys, lowercased: `attr.title`, `tabindex`, `class.active`. */
  readonly hostProperties: readonly string[];
  /** `null` when the literal could not be read. */
  readonly hostDirectives: readonly HostDirectiveUse[] | null;
  /** Set by the compiler whenever the class has an `extends` clause. */
  readonly usesInheritance: boolean;
  /** The class the declaration describes, or `null` when the file's layout hid it. */
  readonly classNode: ClassNode | null;
  readonly module: ModuleRecord;
}

/** A `hostDirectives` entry. */
export interface HostDirectiveUse {
  /** The expression naming the directive, for {@link PartialDeclarationReader.resolve}. */
  readonly expression: TS.Expression;
  /** The names the host exposes, after aliasing: the second of each pair the compiler emits. */
  readonly exposed: readonly string[];
}

/** Where an expression naming a class leads. */
export type Resolution =
  | {
      readonly kind: 'class';
      readonly name: string;
      readonly declaration: PartialDeclaration | null;
      readonly node: ClassNode;
      readonly module: ModuleRecord;
    }
  | { readonly kind: 'external'; readonly name: string; readonly specifier: string }
  | { readonly kind: 'unresolved'; readonly name: string };

/** One JavaScript module of the package, reduced to what resolving a class name needs. */
export interface ModuleRecord {
  readonly path: string;
  readonly file: string;
  readonly locals: ReadonlyMap<string, Binding>;
  /** Exported name to local name. */
  readonly exports: ReadonlyMap<string, string>;
  readonly reexports: ReadonlyMap<string, { readonly specifier: string; readonly imported: string }>;
  readonly stars: readonly string[];
  readonly specifiers: readonly string[];
  readonly declarations: readonly PartialDeclaration[];
  readonly declarationByClass: ReadonlyMap<ClassNode, PartialDeclaration>;
}

type Binding =
  | { readonly kind: 'class'; readonly node: ClassNode }
  | { readonly kind: 'alias'; readonly name: string }
  | { readonly kind: 'import'; readonly specifier: string; readonly imported: string }
  | { readonly kind: 'namespace'; readonly specifier: string }
  | { readonly kind: 'other' };

const DECLARE = new Map<string, PartialDeclaration['kind']>([
  ['ɵɵngDeclareComponent', 'component'],
  ['ɵɵngDeclareDirective', 'directive'],
]);

const JAVASCRIPT = /\.[cm]?js$/;

/** Deep enough for any real chain of re-exports and aliases, and a stop for a cycle the visited sets miss. */
const MAX_DEPTH = 32;

/**
 * The JavaScript a package's `exports` reaches, and the declarations in it.
 *
 * Starts from every JavaScript target in `exports` — under every condition,
 * since a `require` build can hold a component an `import` build does not — and
 * follows relative imports from there, static and dynamic. A FESM bundle can
 * split shared code into a chunk only its entry imports, and an unbundled build
 * has one file per class, so the entry files alone would miss both.
 */
export class PartialDeclarationReader {
  readonly #ts: Ts;
  readonly #packageDir: string;
  readonly #name: string | null;
  readonly #targets: readonly ExportTarget[];
  readonly #modules = new Map<string, ModuleRecord>();

  constructor(ts: Ts, packageDir: string, manifest: Manifest) {
    this.#ts = ts;
    this.#packageDir = packageDir;
    this.#name = typeof manifest.name === 'string' && manifest.name.length > 0 ? manifest.name : null;
    this.#targets = exportTargets(manifest);
  }

  /** Every module reachable from `exports`, in the order it was reached. */
  read(): readonly ModuleRecord[] {
    const queue = this.#entryFiles();
    const seen = new Set(queue);
    const out: ModuleRecord[] = [];
    for (let index = 0; index < queue.length; index += 1) {
      const module = this.#load(queue[index] as string);
      out.push(module);
      for (const specifier of module.specifiers) {
        if (!specifier.startsWith('.')) continue;
        const next = this.#relativeFile(module, specifier);
        if (next !== null && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    return out;
  }

  /** Where the class an `extends` clause or a `hostDirectives` entry names comes from. */
  resolve(module: ModuleRecord, expression: TS.Expression, depth = 0): Resolution {
    const ts = this.#ts;
    const node = unwrap(ts, expression);
    if (depth > MAX_DEPTH) return { kind: 'unresolved', name: node.getText() };

    if (ts.isIdentifier(node)) {
      // A name the module scope does not hold may be a local of a function the
      // class sits in. TypeScript wraps a class with a member carrying a
      // standard decorator in one and keeps its base there — `let _classSuper =
      // NzTreeBase; … return class NzCascaderComponent extends _classSuper` —
      // so the blocks around the name are asked first, as the engine would.
      const local = blockInitializer(ts, node);
      if (local === null) return { kind: 'unresolved', name: node.text };
      if (local !== undefined) return this.resolve(module, local, depth + 1);
      return this.#resolveName(module, node.text, depth + 1);
    }

    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      const binding = module.locals.get(node.expression.text);
      if (binding?.kind === 'namespace') {
        return this.#resolveImport(module, binding.specifier, node.name.text, depth + 1);
      }
    }

    // `forwardRef(() => Foo)`, which the compiler emits for a host directive
    // declared later in the same file.
    if (ts.isCallExpression(node) && calleeName(ts, node) === 'forwardRef') {
      const [factory] = node.arguments;
      const returned = factory === undefined ? undefined : returnedExpression(ts, factory);
      if (returned !== undefined) return this.resolve(module, returned, depth + 1);
    }

    return { kind: 'unresolved', name: node.getText() };
  }

  /** The expression in a class's `extends` clause, or `undefined` when it has none. */
  baseOf(node: ClassNode): TS.Expression | undefined {
    const ts = this.#ts;
    return node.heritageClauses?.find(clause => clause.token === ts.SyntaxKind.ExtendsKeyword)?.types[0]?.expression;
  }

  #entryFiles(): string[] {
    const files: string[] = [];
    for (const target of this.#targets) {
      if (target.target === null || !target.target.startsWith('./')) continue;
      if (target.target.includes('*')) {
        if (!target.subpath.includes('*')) continue;
        for (const file of filesMatching(this.#packageDir, target.target)) {
          if (JAVASCRIPT.test(file)) files.push(file);
        }
        continue;
      }
      const file = join(this.#packageDir, target.target.slice(2));
      // A target that is not there is `unresolvedExports`' finding. Here it
      // holds no class a consumer could render, so nothing goes unread.
      if (JAVASCRIPT.test(file) && isFile(file)) files.push(file);
    }
    return [...new Set(files)];
  }

  #load(path: string): ModuleRecord {
    const cached = this.#modules.get(path);
    if (cached !== undefined) return cached;
    const module = parseModule(this.#ts, path, toPosix(relative(this.#packageDir, path)));
    this.#modules.set(path, module);
    return module;
  }

  #resolveName(module: ModuleRecord, name: string, depth: number): Resolution {
    if (depth > MAX_DEPTH) return { kind: 'unresolved', name };
    const binding = module.locals.get(name);
    switch (binding?.kind) {
      case 'class':
        return {
          kind: 'class',
          name: binding.node.name?.text ?? name,
          declaration: module.declarationByClass.get(binding.node) ?? null,
          node: binding.node,
          module,
        };
      case 'alias':
        return this.#resolveName(module, binding.name, depth + 1);
      case 'import':
        return this.#resolveImport(module, binding.specifier, binding.imported, depth + 1);
      default:
        return { kind: 'unresolved', name };
    }
  }

  #resolveImport(from: ModuleRecord, specifier: string, name: string, depth: number): Resolution {
    if (this.#isExternal(specifier)) return { kind: 'external', name, specifier };
    const target = this.#moduleFile(from, specifier);
    // Unquoted on purpose: `peerDependencyMismatches` reads this file as text,
    // and `from` followed by a quote is what it takes for an import.
    if (target === null) return { kind: 'unresolved', name: `${name} (imported from ${specifier})` };
    return this.#findExport(this.#load(target), name, depth + 1, new Set());
  }

  #findExport(module: ModuleRecord, name: string, depth: number, seen: Set<string>): Resolution {
    if (depth > MAX_DEPTH || seen.has(module.path)) return { kind: 'unresolved', name };
    seen.add(module.path);

    const local = module.exports.get(name);
    if (local !== undefined) return this.#resolveName(module, local, depth + 1);

    const reexport = module.reexports.get(name);
    if (reexport !== undefined) return this.#resolveImport(module, reexport.specifier, reexport.imported, depth + 1);

    // `export *` from inside the package first; one from another package is
    // where the name comes from only if no local star had it.
    let external: string | null = null;
    for (const specifier of module.stars) {
      if (this.#isExternal(specifier)) {
        external ??= specifier;
        continue;
      }
      const target = this.#moduleFile(module, specifier);
      if (target === null) continue;
      const found = this.#findExport(this.#load(target), name, depth + 1, seen);
      if (found.kind !== 'unresolved') return found;
    }
    return external === null ? { kind: 'unresolved', name } : { kind: 'external', name, specifier: external };
  }

  /** Whether a specifier leaves the package: not relative, and not the package's own name. */
  #isExternal(specifier: string): boolean {
    if (specifier.startsWith('.')) return false;
    const name = this.#name;
    return name === null || (specifier !== name && !specifier.startsWith(`${name}/`));
  }

  /** The file a specifier `#isExternal` turned down names inside this package, or `null` when it leads nowhere. */
  #moduleFile(from: ModuleRecord, specifier: string): string | null {
    if (specifier.startsWith('.')) return this.#relativeFile(from, specifier);
    const name = this.#name as string;
    return this.#subpathFile(specifier === name ? '.' : `./${specifier.slice(name.length + 1)}`);
  }

  /**
   * A relative specifier to a file, the way the emitted code will be loaded.
   *
   * Extensionless candidates are tried as well as the literal path, because
   * `ngc` writes the imports it generates without one — `import * as i1 from
   * "./titled"` beside the author's own `'./titled.js'` — and a bundled build
   * never meets the difference. A specifier that leaves the package is not
   * followed: whatever it reaches is not part of what this package ships.
   */
  #relativeFile(from: ModuleRecord, specifier: string): string | null {
    const base = resolve(dirname(from.path), specifier);
    const inside = relative(this.#packageDir, base);
    if (inside.startsWith('..') || isAbsolute(inside)) return null;
    const candidates = [
      base,
      `${base}.js`,
      `${base}.mjs`,
      `${base}.cjs`,
      join(base, 'index.js'),
      join(base, 'index.mjs'),
    ];
    return candidates.find(candidate => JAVASCRIPT.test(candidate) && isFile(candidate)) ?? null;
  }

  /** The JavaScript file `exports` serves for a subpath, trying literal keys before patterns. */
  #subpathFile(subpath: string): string | null {
    const javascript = (target: string | null): string | null => {
      if (target === null || !target.startsWith('./') || !JAVASCRIPT.test(target)) return null;
      const file = join(this.#packageDir, target.slice(2));
      return isFile(file) ? file : null;
    };
    for (const target of this.#targets) {
      if (target.subpath !== subpath) continue;
      const file = javascript(target.target);
      if (file !== null) return file;
    }
    for (const target of this.#targets) {
      const star = target.subpath.indexOf('*');
      if (star === -1 || target.target === null) continue;
      const head = target.subpath.slice(0, star);
      const tail = target.subpath.slice(star + 1);
      if (!subpath.startsWith(head) || !subpath.endsWith(tail) || subpath.length < head.length + tail.length) continue;
      const file = javascript(target.target.replace('*', subpath.slice(head.length, subpath.length - tail.length)));
      if (file !== null) return file;
    }
    return null;
  }
}

function parseModule(ts: Ts, path: string, file: string): ModuleRecord {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

  const locals = new Map<string, Binding>();
  const exports = new Map<string, string>();
  const reexports = new Map<string, { specifier: string; imported: string }>();
  const stars: string[] = [];
  const specifiers: string[] = [];

  const exported = (node: TS.Node): boolean =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some(m => m.kind === ts.SyntaxKind.ExportKeyword);
  const defaulted = (node: TS.Node): boolean =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some(m => m.kind === ts.SyntaxKind.DefaultKeyword);

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const specifier = statement.moduleSpecifier.text;
      specifiers.push(specifier);
      const clause = statement.importClause;
      if (clause?.name !== undefined) locals.set(clause.name.text, { kind: 'import', specifier, imported: 'default' });
      const bindings = clause?.namedBindings;
      if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
        locals.set(bindings.name.text, { kind: 'namespace', specifier });
      } else if (bindings !== undefined) {
        for (const element of bindings.elements) {
          locals.set(element.name.text, {
            kind: 'import',
            specifier,
            imported: (element.propertyName ?? element.name).text,
          });
        }
      }
    } else if (ts.isClassDeclaration(statement) && statement.name !== undefined) {
      locals.set(statement.name.text, { kind: 'class', node: statement });
      if (exported(statement)) exports.set(defaulted(statement) ? 'default' : statement.name.text, statement.name.text);
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) continue;
        const initializer = declaration.initializer === undefined ? undefined : unwrap(ts, declaration.initializer);
        locals.set(
          declaration.name.text,
          initializer !== undefined && ts.isClassExpression(initializer)
            ? { kind: 'class', node: initializer }
            : initializer !== undefined && ts.isIdentifier(initializer)
              ? { kind: 'alias', name: initializer.text }
              : { kind: 'other' },
        );
        if (exported(statement)) exports.set(declaration.name.text, declaration.name.text);
      }
    } else if (ts.isExportDeclaration(statement)) {
      const from =
        statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : null;
      if (from !== null) specifiers.push(from);
      const clause = statement.exportClause;
      if (clause === undefined) {
        if (from !== null) stars.push(from);
      } else if (ts.isNamedExports(clause)) {
        for (const element of clause.elements) {
          const local = (element.propertyName ?? element.name).text;
          if (from === null) exports.set(element.name.text, local);
          else reexports.set(element.name.text, { specifier: from, imported: local });
        }
      }
    } else if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      exports.set('default', statement.expression.text);
    }
  }

  // Filled by the walk below, which needs the finished record to hand each
  // declaration its module.
  const declarations: PartialDeclaration[] = [];
  const declarationByClass = new Map<ClassNode, PartialDeclaration>();
  const record: ModuleRecord = {
    path,
    file,
    locals,
    exports,
    reexports,
    stars,
    specifiers,
    declarations,
    declarationByClass,
  };

  const visit = (node: TS.Node): void => {
    if (ts.isCallExpression(node)) {
      const callee = calleeName(ts, node);
      const kind = callee === null ? undefined : DECLARE.get(callee);
      const [first] = node.arguments;
      if (kind !== undefined && first !== undefined && ts.isObjectLiteralExpression(first)) {
        const declaration = readDeclaration(ts, kind, node, first, record);
        declarations.push(declaration);
        if (declaration.classNode !== null) declarationByClass.set(declaration.classNode, declaration);
      }
      // A dynamic import, which is how a lazily loaded chunk is reached.
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && first !== undefined && ts.isStringLiteral(first)) {
        specifiers.push(first.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return record;
}

function readDeclaration(
  ts: Ts,
  kind: 'component' | 'directive',
  call: TS.CallExpression,
  literal: TS.ObjectLiteralExpression,
  module: ModuleRecord,
): PartialDeclaration {
  const type = property(ts, literal, 'type');
  const typeName = type !== undefined && ts.isIdentifier(type) ? type.text : null;

  // The class whose static field holds the call, which is where every
  // compiler and bundler in use puts it. A declaration assigned after the class
  // (`Foo.ɵcmp = …`) is found through `type` instead.
  let classNode: ClassNode | null = null;
  for (let node: TS.Node | undefined = call.parent; node !== undefined; node = node.parent) {
    if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
      classNode = node;
      break;
    }
  }
  if (classNode === null && typeName !== null) {
    const binding = module.locals.get(typeName);
    if (binding?.kind === 'class') classNode = binding.node;
  }

  const selector = property(ts, literal, 'selector');
  const usesInheritance = property(ts, literal, 'usesInheritance');

  return {
    kind,
    className: classNode?.name?.text ?? typeName ?? '(anonymous class)',
    file: module.file,
    selector: selector !== undefined && ts.isStringLiteralLike(selector) ? selector.text : null,
    inputs: readInputs(ts, property(ts, literal, 'inputs')),
    hostProperties: readHostProperties(ts, property(ts, literal, 'host')),
    hostDirectives: readHostDirectives(ts, property(ts, literal, 'hostDirectives')),
    usesInheritance: usesInheritance !== undefined && usesInheritance.kind === ts.SyntaxKind.TrueKeyword,
    classNode,
    module,
  };
}

/**
 * Public input names from either shape the compiler has emitted.
 *
 * Since 17.1 each entry is an object with a `publicName`; before that, and still
 * for a declaration with no signal input, it is the public name as a string, or
 * `[publicName, classPropertyName, transform?]` when the two differ. The KEY is
 * the class property in both, which is exactly the name a template does not use.
 */
function readInputs(ts: Ts, node: TS.Expression | undefined): readonly string[] | null {
  if (node === undefined || node.kind === ts.SyntaxKind.NullKeyword) return [];
  if (!ts.isObjectLiteralExpression(node)) return null;
  const names: string[] = [];
  for (const entry of node.properties) {
    if (!ts.isPropertyAssignment(entry)) return null;
    const value = unwrap(ts, entry.initializer);
    if (ts.isStringLiteralLike(value)) {
      names.push(value.text);
    } else if (ts.isArrayLiteralExpression(value)) {
      const [first] = value.elements;
      if (first === undefined || !ts.isStringLiteralLike(first)) return null;
      names.push(first.text);
    } else if (ts.isObjectLiteralExpression(value)) {
      const publicName = property(ts, value, 'publicName');
      if (publicName === undefined || !ts.isStringLiteralLike(publicName)) return null;
      names.push(publicName.text);
    } else {
      return null;
    }
  }
  return names;
}

/**
 * Host property-binding keys, lowercased.
 *
 * Only `host.properties`. `host.attributes` is the STATIC half — `host: { title:
 * '' }` — and a static host attribute loses to the same attribute written in a
 * template, because Angular merges the template's attributes last. Unreadable
 * shapes yield nothing, which can only make a check built on this report more,
 * never less.
 */
function readHostProperties(ts: Ts, node: TS.Expression | undefined): readonly string[] {
  if (node === undefined || !ts.isObjectLiteralExpression(node)) return [];
  const properties = property(ts, node, 'properties');
  if (properties === undefined || !ts.isObjectLiteralExpression(properties)) return [];
  const keys: string[] = [];
  for (const entry of properties.properties) {
    const key = entry.name === undefined ? null : nameOf(ts, entry.name);
    if (key !== null) keys.push(key.toLowerCase());
  }
  return keys;
}

/** `[{ directive, inputs: [publicName, alias, …] }]`, which is the only shape the compiler emits. */
function readHostDirectives(ts: Ts, node: TS.Expression | undefined): readonly HostDirectiveUse[] | null {
  if (node === undefined) return [];
  if (!ts.isArrayLiteralExpression(node)) return null;
  const uses: HostDirectiveUse[] = [];
  for (const element of node.elements) {
    if (!ts.isObjectLiteralExpression(element)) return null;
    const directive = property(ts, element, 'directive');
    if (directive === undefined) return null;
    const inputs = property(ts, element, 'inputs');
    const exposed: string[] = [];
    if (inputs !== undefined) {
      if (!ts.isArrayLiteralExpression(inputs)) return null;
      for (let index = 1; index < inputs.elements.length; index += 2) {
        const alias = inputs.elements[index];
        if (alias === undefined || !ts.isStringLiteralLike(alias)) return null;
        exposed.push(alias.text);
      }
    }
    uses.push({ expression: directive, exposed });
  }
  return uses;
}

function property(ts: Ts, literal: TS.ObjectLiteralExpression, key: string): TS.Expression | undefined {
  for (const entry of literal.properties) {
    if (ts.isPropertyAssignment(entry) && nameOf(ts, entry.name) === key) return unwrap(ts, entry.initializer);
    if (ts.isShorthandPropertyAssignment(entry) && entry.name.text === key) return entry.name;
  }
  return undefined;
}

function nameOf(ts: Ts, name: TS.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function calleeName(ts: Ts, call: TS.CallExpression): string | null {
  const callee = call.expression;
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

function returnedExpression(ts: Ts, factory: TS.Expression): TS.Expression | undefined {
  const fn = unwrap(ts, factory);
  if (!ts.isArrowFunction(fn) && !ts.isFunctionExpression(fn)) return undefined;
  if (!ts.isBlock(fn.body)) return fn.body;
  const [only] = fn.body.statements;
  return only !== undefined && ts.isReturnStatement(only) ? only.expression : undefined;
}

/**
 * The initializer of the variable a block around `name` declares under that
 * name: `null` when it declares one without, `undefined` when no block does and
 * the module scope is the one to ask. The nearest block wins, as it does in the
 * engine, so a local shadowing a module binding is never mistaken for it.
 */
function blockInitializer(ts: Ts, name: TS.Identifier): TS.Expression | null | undefined {
  for (let node: TS.Node = name.parent; !ts.isSourceFile(node); node = node.parent) {
    if (!ts.isBlock(node)) continue;
    for (const statement of node.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.name.text === name.text) {
          return declaration.initializer ?? null;
        }
      }
    }
  }
  return undefined;
}

function unwrap(ts: Ts, node: TS.Expression): TS.Expression {
  let current = node;
  while (ts.isParenthesizedExpression(current)) current = current.expression;
  return current;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function toPosix(path: string): string {
  return path.split(sep).join(posix.sep);
}
