import { isWritableSignal, type DebugElement, type OutputEmitterRef, type Type } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { FormField } from '@angular/forms/signals';

/**
 * The rules {@link assertSignalFormsControl} can break, in the order it checks
 * them. The id is on the thrown {@link SignalFormsControlError}, so a test can
 * assert WHICH rule failed rather than matching prose that will be reworded.
 *
 * @since 0.1.0
 */
export type SignalFormsControlRule =
  | 'value-model'
  | 'single-model'
  | 'no-value-accessor'
  | 'touch-output'
  | 'disabled-input'
  | 'readonly-input'
  | 'value-round-trip'
  | 'touch-marks-touched';

/** Thrown by {@link assertSignalFormsControl}, carrying the rule that broke. */
/** @since 0.1.0 */
export class SignalFormsControlError extends Error {
  readonly rule: SignalFormsControlRule;

  constructor(rule: SignalFormsControlRule, control: string, explanation: string) {
    super(`ngtrue: ${control} is not a conforming Signal Forms control.\n\nrule: ${rule}\n\n${explanation}\n`);
    this.name = 'SignalFormsControlError';
    this.rule = rule;
  }
}

/** Options for {@link assertSignalFormsControl}. */
export interface SignalFormsControlOptions {
  /**
   * CSS selector for the element carrying `[formField]`, when the fixture binds
   * more than one. Without it the fixture must hold exactly one bound control —
   * guessing between two would make the result depend on template order.
   */
  readonly selector?: string;

  /**
   * Two distinct values to drive the round trip with, for a control that does
   * not pass its value through untouched.
   *
   * The default is a pair of objects with no meaning to anything, which is
   * right for the common case: a `model()` has no transform, so whatever the
   * field writes is what the model reports back. A control that normalises —
   * trims a string, coerces a number, refuses an unparseable entry — will
   * rightly not echo an anonymous object, and that is a false failure rather
   * than a defect. Pass two values it accepts. A `checked` model, and a `value`
   * model currently holding a boolean, need nothing: the probe flips the value
   * it finds.
   */
  readonly values?: readonly [unknown, unknown];
}

/**
 * Assert that a candidate control is wired to Angular's Signal Forms, and fail
 * naming the rule that broke.
 *
 * Give it a host that binds the control with `[formField]`, the way a consumer
 * would — as a factory, so the assertion owns the fixture's creation:
 *
 * ```ts
 * @Component({
 *   template: `<my-rating [formField]="form.score" />`,
 *   imports: [MyRating, FormField],
 * })
 * class Host {
 *   readonly model = signal({ score: 3 });
 *   readonly form = form(this.model);
 * }
 *
 * it('conforms', async () => {
 *   await assertSignalFormsControl(() => TestBed.createComponent(Host));
 * });
 * ```
 *
 * A finished `ComponentFixture` is accepted too and is very slightly weaker.
 * `[formField]` decides what it bound to while the fixture RENDERS, which
 * `TestBed.createComponent` does, so a control with no model at all throws
 * NG1914 out of that call — before an assertion handed the result could look at
 * anything. Passing the factory lets this function catch that and answer with
 * the same named rule as everything else, and with the reason Angular's own
 * message leaves out.
 *
 * ## It is stricter than Angular's own contract, deliberately
 *
 * In `FormValueControl` only `value` is required; `disabled`, `readonly` and
 * `touch` are all optional, and a control that omits them compiles, binds and
 * renders. That optionality is the problem this function exists for. Angular
 * writes every name it binds onto whatever the control declares and skips the
 * rest in silence, so an omitted `readonly` is not a missing feature that
 * someone will notice — it is a schema rule that evaporates, with no error, no
 * warning and a field that goes on looking editable. A library shipping a
 * control to other people does not get to leave those three to chance, so
 * ngtrue requires all three.
 *
 * ## What it checks
 *
 * Six rules are read off the runtime directive definition, which is where
 * Angular reads them, so the check and the framework cannot disagree: a `value`
 * or `checked` `model()`, exactly one of the two, no `ControlValueAccessor`
 * competing for the binding, and inputs named `disabled` and `readonly` beside
 * an output named `touch`. Two more are driven through the bound field: the
 * value must cross in both directions, and `touch` must actually mark the field
 * touched.
 *
 * Every name is matched as Angular matches it — by the PUBLIC binding name, not
 * the class property. `value = model('', { alias: 'val' })` is a control
 * Angular will never find a model on, and the alias is invisible to anyone
 * reading the class.
 *
 * ## What it does not check, and why
 *
 * **It cannot turn `readonly` or `disabled` on.** Those states come from the
 * schema, and Angular offers no public way to write a nested directive's signal
 * input from outside its template. So the presence of the two inputs is checked
 * and their behaviour is not — which is a smaller gap than it sounds, because
 * presence is the whole of Angular's mechanism. What a reviewer still has to
 * do by hand:
 *
 * - **Read-only must not be disabled.** A read-only control keeps its tab stop,
 *   keeps announcing its value and still submits; only the write path is
 *   refused. Delegating `readonly` to `disabled` passes every rule here.
 * - **`aria-readonly` belongs only on a role that allows it** — `checkbox`,
 *   `switch`, `radiogroup`, `combobox`, `slider`, `textbox` — and is illegal on
 *   `radio`, `tree`, `group` and `button`. jsdom computes no implicit roles, so
 *   there is nothing here to hold an attribute against.
 * - **A composite whose own parts are controls must shield its subtree** from
 *   the surrounding field and read the real one with `skipSelf`, or its inner
 *   controls each announce the outer field's error as their own. That turns on
 *   the library's own form-field token, which ngtrue cannot know about.
 *
 * **The round trip proves the binding, not the component.** It shows that the
 * model found on the class is the one Angular connected, and that a value
 * survives the trip in both directions. It says nothing about whether the
 * component writes its model on every path that changes the value — a control
 * that updates the field when you type and forgets to when you pick from its
 * own panel passes this and is broken. That needs the control's own
 * interactions and belongs in the control's own spec.
 *
 * ## The fixture is spent afterwards
 *
 * The value is written twice and the field is marked touched, with no attempt
 * to put either back: a restore that silently failed would leave a later
 * assertion reading a value this function chose. Give it a fixture of its own.
 *
 * @throws {SignalFormsControlError} naming the first rule that broke. First
 *   rather than all of them, because the later rules cannot be evaluated until
 *   the earlier ones hold — there is nothing to drive a round trip through
 *   until a model has been found.
 *
 * @since 0.1.0
 */
export async function assertSignalFormsControl<T>(
  subject: ComponentFixture<T> | (() => ComponentFixture<T>),
  options: SignalFormsControlOptions = {},
): Promise<void> {
  const fixture = typeof subject === 'function' ? build(subject) : subject;
  await flush(fixture);

  const node = locate(fixture, options.selector);
  const control = describeControl(node);

  // 1 & 2. A model Angular can find, and only one of them.
  const kinds = MODEL_KINDS.filter(kind => modelBinding(control.def, kind) !== null);
  if (kinds.length > 1) {
    throw new SignalFormsControlError(
      'single-model',
      control.label,
      `${control.name} declares BOTH a \`value\` and a \`checked\` model.\n\n` +
        'Angular tests `value` first and stops at the first match, so `value` is bound and\n' +
        'the `checked` model is never written and never read — a dead input that looks live\n' +
        "in the template. Angular's own contract says as much in the types: FormValueControl\n" +
        'declares `checked?: undefined` and FormCheckboxControl declares `value?: undefined`.\n\n' +
        'Pick the one that is the form value and give the other idea its own name.',
    );
  }
  if (kinds.length === 0) {
    throw new SignalFormsControlError('value-model', control.label, noModel(control));
  }

  const kind = kinds[0] as ModelKind;
  const binding = modelBinding(control.def, kind) as ModelBinding;
  const model = (control.instance as Record<string, unknown>)[binding.classProperty];
  if (!isWritableSignal(model)) {
    throw new SignalFormsControlError(
      'value-model',
      control.label,
      `${control.name} declares a \`${kind}\` input and a \`${kind}Change\` output, but\n` +
        `\`${binding.classProperty}\` is not a writable signal.\n\n` +
        'That shape is usually a hand-rolled `input()` plus `output()` standing in for a\n' +
        '`model()`. Angular tolerates it at runtime and the contract does not: both\n' +
        'FormValueControl and FormCheckboxControl type the member as `ModelSignal`. The\n' +
        'difference is not cosmetic — an `input()` is read-only, so the component cannot\n' +
        'update the field by writing its own value and has to remember an explicit emit on\n' +
        'every path instead. The paths that get forgotten are the ones nobody tests.\n\n' +
        `Declare it as \`readonly ${kind} = model(…)\`.`,
    );
  }

  // 3. Nothing else claiming the binding.
  if (node.injector.get(NG_VALUE_ACCESSOR, null, { self: true, optional: true }) !== null) {
    throw new SignalFormsControlError(
      'no-value-accessor',
      control.label,
      `${control.name} has a \`${kind}\` model AND provides NG_VALUE_ACCESSOR.\n\n` +
        'Angular resolves a `[formField]` host in order and tries the accessor FIRST, so the\n' +
        'model loses: the field talks to `writeValue` / `registerOnChange` and the signal the\n' +
        'template binds is never written. Nothing throws, which is what earns this a rule —\n' +
        'a control that gained a model and kept its old accessor still works in classic forms\n' +
        'and is inert in a signal form.\n\n' +
        'Drop the NG_VALUE_ACCESSOR provider. `[(ngModel)]`, `[formControl]` and\n' +
        '`formControlName` keep working without one: Angular drives the model directly.',
    );
  }

  // 4-6. The three names Angular writes onto a control and skips in silence.
  requireOutput(
    control,
    'touch',
    'touch-output',
    'Angular subscribes to an output named exactly `touch`, and to nothing else — `touched`,\n' +
      '`blurred` and `onTouch` are not looked for. Without it a field bound to this control\n' +
      'is never touched, so every "show the error once they have been here" rule stays silent\n' +
      'for the life of the form.\n\n' +
      'Add `readonly touch = output<void>()` and emit it on blur, not on focus.',
  );

  requireInput(
    control,
    'disabled',
    'disabled-input',
    'A field disabled by the schema is delivered to the control as a `disabled` input.\n' +
      'Angular writes every name it binds onto whatever the control declares and skips the\n' +
      'rest without a word, so a control with no `disabled` input never learns that it should\n' +
      'stop accepting input.\n\n' +
      'Add `readonly disabled = input(false)`.',
  );

  requireInput(
    control,
    'readonly',
    'readonly-input',
    'Same mechanism as `disabled`, and the one people leave out. `readonly()` in a schema\n' +
      'reaches a control only if the control declares a `readonly` input; nothing warns when\n' +
      'it does not, and the field goes on looking editable.\n\n' +
      'Add `readonly readonly = input(false)`, and guard the WRITE path with it rather than\n' +
      'routing it into `disabled` — read-only keeps its tab stop, keeps announcing its value\n' +
      'and still submits, which is the whole difference between the two.',
  );

  // 7. The value crosses in both directions.
  //
  // What this proves that reading the definition does not: that the model found
  // on the class is the model Angular CONNECTED. Those can differ — a host
  // directive contributes its own `value`/`valueChange` pair to the node, and
  // the binding may have been made to that one instead. It also catches a
  // control that alters the value on the way through, which the message says
  // how to tell apart from a real defect.
  //
  // `controlValue` rather than `value`, because `controlValue` is the signal the
  // binding reads and writes. On a plain field the two are the same; under
  // `transformedValue` they are not, and comparing against `value` would report
  // a working control as broken for doing exactly what the schema asked.
  const state = control.formField.state();
  const [inbound, outbound] = probeValues(kind, state.controlValue(), options.values);

  state.controlValue.set(inbound);
  await flush(fixture);
  if (!Object.is(model(), inbound)) {
    throw new SignalFormsControlError(
      'value-round-trip',
      control.label,
      `The field wrote ${show(inbound)} and ${control.name}'s \`${binding.publicName}\` reports ${show(model())}.\n\n` +
        'Either the inbound half of the binding is not connected — the model on the class is\n' +
        'not the one Angular bound, which happens when a host directive contributes a second\n' +
        '`value` pair to the same element — or the control alters the value on the way in.\n\n' +
        'If it normalises on purpose, pass `values` with two values it accepts: the default\n' +
        'probes are anonymous objects, and a control that coerces will rightly refuse them.',
    );
  }

  model.set(outbound);
  await flush(fixture);
  if (!Object.is(state.controlValue(), outbound)) {
    throw new SignalFormsControlError(
      'value-round-trip',
      control.label,
      `${control.name} set \`${binding.publicName}\` to ${show(outbound)} and the field still reads ${show(state.controlValue())}.\n\n` +
        'The outbound half is not connected, and this is the asymmetry worth testing for: a\n' +
        'control that accepts a programmatic write and never reports an edit back looks\n' +
        'entirely correct on screen. It renders the right value, it follows `[formField]`,\n' +
        'and the form it is bound to keeps whatever it started with for the life of the page.',
    );
  }

  // 8. `touch` reaches the field. Last, because it cannot be undone.
  if (state.touched()) {
    throw new SignalFormsControlError(
      'touch-marks-touched',
      control.label,
      'The field was already touched before this rule could be probed, so a pass would have\n' +
        'meant nothing — `touched` only ever goes from false to true, and a check that starts\n' +
        'at true answers the same for a wired control and an unwired one.\n\n' +
        'Give this assertion a fixture of its own, freshly created and not yet blurred.',
    );
  }
  const touchProperty = (control.def.outputs ?? {})['touch'] as string;
  ((control.instance as Record<string, unknown>)[touchProperty] as OutputEmitterRef<void>).emit();
  await flush(fixture);
  if (!state.touched()) {
    throw new SignalFormsControlError(
      'touch-marks-touched',
      control.label,
      `${control.name} emitted \`touch\` and the field is still untouched.\n\n` +
        'The output exists under the right name but is not the one Angular subscribed to. The\n' +
        'usual cause is a second `touch` further up a host-directive chain, or an output\n' +
        're-declared on a subclass so the instance carries a different emitter than the\n' +
        'definition names.',
    );
  }
}

const MODEL_KINDS = ['value', 'checked'] as const;
type ModelKind = (typeof MODEL_KINDS)[number];

interface ModelBinding {
  readonly publicName: ModelKind;
  readonly classProperty: string;
}

/**
 * The runtime directive definition, read the way Angular reads it.
 *
 * `inputs` and `outputs` are keyed by PUBLIC name and hold the class property
 * name — `{ formField: ['field', 1, null] }` for a `field` input aliased to
 * `formField`. Reading the definition rather than the class also means
 * inherited members are seen, since `ɵɵInheritDefinitionFeature` has merged a
 * base class in by the time there is a definition to read.
 */
interface DirectiveDefinition {
  readonly inputs?: Record<string, string | readonly unknown[]>;
  readonly outputs?: Record<string, string>;
}

interface LocatedControl {
  readonly formField: FormField<unknown>;
  readonly instance: object;
  readonly def: DirectiveDefinition;
  readonly name: string;
  readonly label: string;
}

/** Angular's code for "this is not a valid `[formField]` host". */
const INVALID_FORM_FIELD_HOST = 1914;

/**
 * Create the fixture here, so the one rule Angular enforces loudly arrives
 * wearing the same clothes as the quiet ones.
 *
 * `TestBed.createComponent` renders, and `[formField]` decides what it bound to
 * during that render — so a host with no model on it throws NG1914 before an
 * assertion handed the finished fixture could ever look at it. Creating it
 * inside the assertion is the only way to catch that, which is why the factory
 * form is the one the documentation leads with. Angular's message names the
 * component and stops; the one built here goes on to the reason people are
 * actually standing in, which is an alias.
 */
function build<T>(create: () => ComponentFixture<T>): ComponentFixture<T> {
  try {
    return create();
  } catch (error) {
    if (!isInvalidHostError(error)) throw error;
    throw new SignalFormsControlError(
      'value-model',
      'The bound control',
      'Angular refused the `[formField]` host outright: it found neither a native form\n' +
        'element nor a custom control with a `value` or `checked` model on it.\n\n' +
        'A custom control is recognised by name — an input `value` beside a `valueChange`\n' +
        'output, or `checked` beside `checkedChange` — and a `model()` declares both at once,\n' +
        'which is why it is the idiom. If the names look right in the class, check for an\n' +
        'alias: Angular matches the PUBLIC binding name, so a `value` model aliased to\n' +
        "anything else is not one. Angular's own words follow.\n\n" +
        indent(messageOf(error)),
    );
  }
}

async function flush<T>(fixture: ComponentFixture<T>): Promise<void> {
  // Both, in this order, and never a microtask instead. Zoneless change
  // detection runs in a macrotask, so work queued from a signal write is still
  // pending when the next line reads the result — the failure mode where a
  // synchronous `detectChanges()` makes a test pass on a component that is
  // broken in an application.
  fixture.detectChanges();
  await fixture.whenStable();
}

function isInvalidHostError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === INVALID_FORM_FIELD_HOST || /\bNG0*1914\b/.test(messageOf(error));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function locate<T>(fixture: ComponentFixture<T>, selector: string | undefined): DebugElement {
  const root = fixture.debugElement;
  const all = [root, ...root.queryAll(() => true)];
  const bound = all.filter(de => de.injector.get(FormField, null, { self: true, optional: true }) !== null);

  if (selector !== undefined) {
    const matched = bound.filter(de => (de.nativeElement as Element | null)?.matches?.(selector) === true);
    if (matched.length === 0) {
      throw new Error(
        `ngtrue: no element matching \`${selector}\` in this fixture carries [formField].\n` +
          `Elements that do: ${list(bound.map(tag))}`,
      );
    }
    if (matched.length > 1) {
      throw new Error(`ngtrue: \`${selector}\` matches ${String(matched.length)} bound controls; narrow it to one.`);
    }
    return matched[0] as DebugElement;
  }

  if (bound.length === 0) {
    throw new Error(
      'ngtrue: no element in this fixture carries [formField].\n\n' +
        'The host has to bind the candidate control the way a consumer would. That binding is\n' +
        'what makes Angular resolve the control at all, and every rule here is about what it\n' +
        'resolved to — a fixture that merely renders the component would let this assertion\n' +
        'pass on a control nothing had tried to bind.',
    );
  }
  if (bound.length > 1) {
    throw new Error(
      `ngtrue: this fixture binds ${String(bound.length)} controls (${list(bound.map(tag))}).\n` +
        'Pass `selector` to say which one to check — choosing here would make the answer\n' +
        'depend on template order.',
    );
  }
  return bound[0] as DebugElement;
}

/**
 * The directive on the bound node that is the candidate control.
 *
 * A control may be a component (`<my-rating>`) or a directive on someone else's
 * element, so this cannot simply read `componentInstance`; and a node may carry
 * several directives, so it filters to the one with a model the way Angular
 * does.
 */
function describeControl(node: DebugElement): LocatedControl {
  const formField = node.injector.get(FormField, null, { self: true, optional: true }) as FormField<unknown>;

  const seen = new Set<Type<unknown>>();
  const candidates: Type<unknown>[] = [];
  const component = node.componentInstance as object | null;
  for (const token of [...((node.providerTokens ?? []) as unknown[]), component?.constructor]) {
    if (typeof token !== 'function') continue;
    const type = token as Type<unknown>;
    if (seen.has(type) || type === FormField) continue;
    seen.add(type);
    if (definitionOf(type) !== null) candidates.push(type);
  }

  const withModel = candidates.filter(type => {
    const def = definitionOf(type) as DirectiveDefinition;
    return MODEL_KINDS.some(kind => modelBinding(def, kind) !== null);
  });

  if (withModel.length > 1) {
    throw new SignalFormsControlError(
      'single-model',
      `<${tag(node)}>`,
      `Two directives on this element declare a model: ${list(withModel.map(t => t.name))}.\n\n` +
        'Angular binds the first in directive order and leaves the other inert, so which of\n' +
        'them is the control depends on declaration order rather than on intent. Put the\n' +
        'model on one of them.',
    );
  }

  // With no model anywhere, carry on with the first directive on the node so the
  // `value-model` rule can name it and print what it did declare. Reporting "no
  // control found" would describe the fixture, when what is wrong is the class.
  const type = withModel[0] ?? candidates[0];
  if (type === undefined) {
    throw new SignalFormsControlError(
      'value-model',
      `<${tag(node)}>`,
      'This element carries [formField] and no other directive at all, so there is no\n' +
        'candidate control on it to check.',
    );
  }

  const instance = node.injector.get(type, null, { self: true, optional: true });
  if (instance === null) {
    throw new Error(`ngtrue: ${type.name} is declared on <${tag(node)}> but could not be injected from it.`);
  }

  return {
    formField,
    instance: instance as object,
    def: definitionOf(type) as DirectiveDefinition,
    name: type.name,
    label: `<${tag(node)}> (${type.name})`,
  };
}

function definitionOf(type: Type<unknown>): DirectiveDefinition | null {
  const holder = type as unknown as { ɵcmp?: DirectiveDefinition; ɵdir?: DirectiveDefinition };
  return holder.ɵcmp ?? holder.ɵdir ?? null;
}

function modelBinding(def: DirectiveDefinition, kind: ModelKind): ModelBinding | null {
  const input = def.inputs?.[kind];
  const hasChangeOutput = def.outputs !== undefined && `${kind}Change` in def.outputs;
  if (input === undefined || !hasChangeOutput) return null;
  return { publicName: kind, classProperty: typeof input === 'string' ? input : (input[0] as string) };
}

function noModel(control: LocatedControl): string {
  return (
    `${control.name} declares neither a \`value\` nor a \`checked\` model.\n\n` +
    'Angular finds a custom control by name: an input `value` beside a `valueChange` output,\n' +
    'or `checked` beside `checkedChange`. A `model()` declares both at once, which is why it\n' +
    'is the idiom.\n\n' +
    `Inputs seen: ${list(Object.keys(control.def.inputs ?? {}))}\n` +
    `Outputs seen: ${list(Object.keys(control.def.outputs ?? {}))}\n\n` +
    'If the names look right, check for an alias — Angular matches the PUBLIC binding name.'
  );
}

function requireInput(control: LocatedControl, name: string, rule: SignalFormsControlRule, why: string): void {
  if (control.def.inputs !== undefined && name in control.def.inputs) return;
  throw new SignalFormsControlError(
    rule,
    control.label,
    `${control.name} declares no \`${name}\` input.\n\n${why}\n\n` +
      `Inputs seen: ${list(Object.keys(control.def.inputs ?? {}))}`,
  );
}

function requireOutput(control: LocatedControl, name: string, rule: SignalFormsControlRule, why: string): void {
  if (control.def.outputs !== undefined && name in control.def.outputs) return;
  throw new SignalFormsControlError(
    rule,
    control.label,
    `${control.name} declares no \`${name}\` output.\n\n${why}\n\n` +
      `Outputs seen: ${list(Object.keys(control.def.outputs ?? {}))}`,
  );
}

function probeValues(
  kind: ModelKind,
  current: unknown,
  supplied: readonly [unknown, unknown] | undefined,
): readonly [unknown, unknown] {
  if (supplied !== undefined) return supplied;
  if (kind === 'checked' || typeof current === 'boolean') return [!current, current];
  return [{ ngtrue: 'probe-a' }, { ngtrue: 'probe-b' }];
}

function tag(node: DebugElement): string {
  return (node.nativeElement as Element | null)?.tagName?.toLowerCase() ?? 'unknown element';
}

function list(values: readonly string[]): string {
  return values.length === 0 ? 'none' : values.map(value => `\`${value}\``).join(', ');
}

function indent(text: string): string {
  return text
    .split('\n')
    .map(line => `  ${line}`)
    .join('\n');
}

function show(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null || value === undefined || typeof value !== 'object') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}
