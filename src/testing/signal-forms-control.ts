import {
  isWritableSignal,
  resolveForwardRef,
  type DebugElement,
  type OutputEmitterRef,
  type Type,
} from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { NG_VALUE_ACCESSOR } from '@angular/forms';
import { FormField, type FieldState } from '@angular/forms/signals';

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
  | 'write-keeps-pristine'
  | 'value-round-trip'
  | 'touch-marks-touched'
  | 'focus-reaches-control';

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
   * Two distinct values to drive the value rules with, for a control that does
   * not pass its value through untouched. The first is written from the form's
   * side, the way a load or a patch writes, and has to leave the field pristine
   * and arrive in the model; the second is written by the control and has to
   * arrive in the field.
   *
   * The default is a pair of objects with no meaning to anything, which is
   * right for the common case: a `model()` has no transform, so whatever the
   * field writes is what the model reports back. A control that normalises —
   * trims a string, coerces a number, refuses an unparseable entry — will
   * rightly not keep an anonymous object, and that is a false failure rather
   * than a defect. Pass two values it accepts. A `checked` model, and a `value`
   * model currently holding a boolean, need nothing: the probe flips the value
   * it finds.
   *
   * The default never puts a clamp to work either, because an object is never
   * out of range: a clamp that compares leaves it alone, and one that does
   * arithmetic turns it into `NaN`, which reads as a conversion. For a control
   * that clamps, make the FIRST value one it would clamp — or start the
   * fixture's field out of range — so that a clamp written back into the model
   * has something to do.
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
 * `focus()` is optional in the same way and fails in the same silence. When a
 * control declares none, Angular focuses the host element instead, and on a
 * custom element with no tab stop that does nothing at all — so
 * `focusBoundControl()`, which a form calls to take the user to the first
 * invalid field after a failed submit, returns normally and leaves focus on the
 * submit button. ngtrue does not require the method, because a host that IS the
 * interactive element is focused correctly without one; it requires the
 * outcome, which is that focus lands inside the control.
 *
 * That rule was asked for by other people before it was written here.
 * [tutkli/forty-cdk#1149](https://github.com/tutkli/forty-cdk/issues/1149)
 * found focus-on-error working in three of about fourteen form primitives,
 * each of the rest focusing a host wrapper that could not take it.
 * [ngx-signal-forms/ngx-signal-forms#434](https://github.com/ngx-signal-forms/ngx-signal-forms/issues/434)
 * calls `focusBoundControl()` a silent no-op for a field with no focusable
 * binding, and had to detect the miss at run time on the consumer's side. ngwr
 * shipped twenty value controls with no tab stop on the host, and only the
 * editor, in `e559a807`, declares the `focus()` that Signal Forms calls.
 *
 * ## A value the form writes is not an edit
 *
 * Signal Forms cannot tell who changed a control's model. Every value a control
 * reports back is recorded as the user's edit and marks the field dirty, so a
 * control that adjusts a value it was HANDED — normalises `null` to `''`,
 * clamps it into range, fills in a default — and writes the adjustment back
 * turns a form that has only been loaded into one that has been edited, and
 * says nothing. An unsaved-changes guard fires on a page nobody touched, and the
 * value the form loaded is gone: a clamp written back deletes the very
 * out-of-range value a `max()` rule exists to report.
 *
 * ngwr made this mistake three times before the rule was written here. Its
 * input-number and slider stopped clamping into the model in `2905c03f`, its
 * rating followed in `42cd197d` with a spec that a pristine field stays
 * pristine, and `wr-knob` still clamps from an `effect`: a field started at 150
 * against a maximum of 100 is dirty after the first render and holds 100. The
 * classic-forms version of it, an accessor that reports `writeValue` back
 * through `onChange`, reached PrimeNG's tracker more than once
 * ([primefaces/primeng#14095](https://github.com/primefaces/primeng/issues/14095),
 * [primefaces/primeng#16474](https://github.com/primefaces/primeng/issues/16474)).
 *
 * The rule writes from the form's side twice and reads `dirty()` after each:
 * once by rendering, which hands the control the value the fixture started the
 * field with, and once through the field's `value.set`, which is what a load or
 * a patch does. Only a DIFFERENT value written back can dirty the field, since a
 * model emits only when its value changes, so the rule passes a control that
 * adjusts nothing and one that adjusts only what it shows. It does not judge
 * whether an adjustment is wanted, only that it is not recorded as an edit.
 *
 * ## What it checks
 *
 * Six rules are read off the runtime directive definitions, which is where
 * Angular reads them: a `value` or `checked` `model()`, exactly one of the two,
 * no `ControlValueAccessor` competing for the binding, and inputs named
 * `disabled` and `readonly` beside an output named `touch`. Four more are
 * driven through the bound field: a value the form writes must leave the field
 * pristine, the value must cross in both directions, `touch` must actually mark
 * the field touched, and asking the field to focus its control must leave focus
 * on the host element or inside it.
 *
 * Every name is matched as Angular matches it — by the PUBLIC binding name, not
 * the class property. `value = model('', { alias: 'val' })` is a control
 * Angular will never find a model on, and the alias is invisible to anyone
 * reading the class.
 *
 * ## A control assembled from host directives
 *
 * Angular has resolved a custom control through `hostDirectives` since core 22
 * (angular/angular#67329, "ensure custom controls resolve host directives"),
 * and building controls that way is common enough that it reached Angular's
 * tracker twice from people with no connection to each other: "All custom form
 * controls use this (via the hostDirectives array)" (angular/angular#69562),
 * and "a common pattern in our codebase" (angular/angular#66592). So the rules
 * follow Angular's resolution rather than any one class:
 *
 * - **The control is a directive the template matched** — the component, or an
 *   attribute directive — and never one of its host directives on its own.
 * - **Its model is its own** `value` / `valueChange` (or `checked` /
 *   `checkedChange`) pair if it has one. Otherwise it is a pair that ONE host
 *   directive exposes, both halves from the same directive, which Angular
 *   requires; the class property behind it can be called anything, since an
 *   exposure may alias.
 * - **`disabled`, `readonly` and `touch` count when the control declares them,
 *   or when a host directive anywhere beneath it exposes them.** Exposure goes
 *   straight to the element at every level, so a relay in between does not have
 *   to re-expose. A member a host directive declares and does NOT expose is
 *   never written and never listened to — the class reads complete and the
 *   field never reaches it — so it is reported as missing, naming the
 *   directive that holds it.
 * - **`single-model` counts the template's directives, not host directives.** A
 *   host directive's unexposed model is invisible to Angular, so it is not a
 *   rival to the component's.
 * - **`focus` is the control's own.** Angular calls it on the directive the
 *   template matched, even when the model is exposed from beneath, and never
 *   on a host directive: a method cannot be exposed the way an input can.
 *
 * Reading it this way has three limits, and the driven rules cover only part of
 * them: the round trip and the touch probe go through what Angular actually
 * connected, so they catch a wrong reading of the MODEL and of `touch`, and
 * nothing catches one of `disabled` or `readonly`, which no fixture can turn on.
 *
 * The walk reads Angular's private definition fields — `hostDirectives`,
 * including the function form the compiler emits when one is named through
 * `forwardRef` — and those can move between minors. A definition that no longer
 * carries the field, or an entry naming something that is not a directive, is
 * refused with an error rather than read as having no host directives: reading
 * none would make every host directive a candidate of its own, and a control
 * whose `readonly` sits unexposed on a complete host directive would pass. A
 * change in what Angular DOES with a field it can still read is what ngtrue's
 * own spec pins, and that runs against the Angular ngtrue was tested with, not
 * the one a consumer installs.
 *
 * No definition shows that a TEMPLATE applied one of the control's host
 * directives by hand, which makes Angular treat it as the template's and drop
 * the exposure the control declared. For the model and `touch` the driven rules
 * fail there. For `disabled` and `readonly` the drop is harmless under the same
 * name, because the directive the template matched publishes `disabled` itself
 * and Angular writes it there — but an ALIASED exposure (`inputs:
 * ['isDisabled: disabled']`) goes with the entry, and this check passes a
 * fixture in which Angular writes neither input. Measured on core 22.2.1 and
 * pinned in ngtrue's own spec. It is the fixture's template and not the
 * control, which is one more reason to bind the control exactly as a consumer
 * would and nothing more.
 *
 * The last has no driven rule to catch it, because Angular itself agrees with
 * the answer. When two entries reach the same host directive, Angular merges
 * their exposures by writing into whichever entry it met first, and that entry
 * can belong to a SHARED behaviour directive's definition. Measured on core
 * 22.2.1, and pinned in ngtrue's own spec so this paragraph goes when the
 * behaviour does: a component composing a behaviour plus an extra exposure of
 * the behaviour's own host directive adds that exposure to the behaviour
 * itself, so every other control composing the behaviour exposes it too — once
 * the first has rendered, for the rest of the run. Definitions are read after
 * Angular has resolved them, so this answers with what Angular binds at that
 * moment: a control leaning on such an exposure passes after the other
 * component has rendered in the same run and fails without it.
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
 * model resolved from the definitions is the one Angular connected, and that a
 * value survives the trip in both directions. It says nothing about whether the
 * component writes its model on every path that changes the value — a control
 * that updates the field when you type and forgets to when you pick from its
 * own panel passes this and is broken. That needs the control's own
 * interactions and belongs in the control's own spec.
 *
 * **The pristine rule sees an adjustment only when the value written needs
 * one.** It writes the fixture's starting value and the first probe value, and
 * nothing else. The default probe is an anonymous object, which is never out of
 * range, so an in-range start and the default `values` never put a clamp to
 * work: a control that clamps into its model with a comparison passes, and one
 * whose clamp turns an object into `NaN` fails as a conversion, which in-range
 * `values` then make pass. Start the fixture's field out of range, or pass
 * `values` whose first value is, and the clamp has to show itself. The same
 * goes for a control that normalises only some values — whitespace, case, a
 * date's time of day: it is caught by a start or a first value it would change.
 *
 * It also takes the fixture at its word. Nothing but the control is supposed to
 * write to the field before the assertion does, so a field that is dirty after
 * the first render is reported against the control — and a test that dirtied
 * the field itself before handing it over gets the same report.
 *
 * **The focus rule proves focus arrived, not that it arrived somewhere
 * useful.** jsdom has no layout, so it cannot tell a visible target from one
 * nobody can see: a target clipped to nothing, moved off-screen, zero-sized or
 * `visibility: hidden` still takes focus here, and `display: none` stops it
 * only where jsdom's own cascade resolves the declaration. Nor does the rule
 * look at what took focus. A `focus()` that lands on a wrapper with
 * `tabindex="-1"` passes, while a keyboard user can never tab back to that
 * wrapper and a screen reader announces a nameless group instead of the field.
 * Whether focus reaches the element that takes input, and whether that element
 * is visible, stays a reviewer's job.
 *
 * It also waits for exactly one thing after the call: the render that follows
 * it. A `focus()` that defers to `afterNextRender` passes; one that defers to
 * `setTimeout` is reported as a miss, though focus would arrive later in an
 * application. No timer is awaited, which is what keeps the rule usable under
 * fake timers — and it means a control that takes focus BACK on a timer after
 * being blurred is not seen by the starting-point check either.
 *
 * ## The fixture is spent afterwards
 *
 * The value is written twice, the field is marked touched and focus is moved
 * into the control, with no attempt to put any of it back: a restore that
 * silently failed would leave a later assertion reading a value this function
 * chose. Give it a fixture of its own: fresh, since a field that is already
 * dirty is read as the control's doing; attached to the document the way
 * `TestBed.createComponent` attaches it, since nothing detached can take focus;
 * and bound to a field the schema leaves interactive. Signal Forms reads
 * `dirty` and `touched` as false on a hidden, disabled or read-only field
 * whatever has been written or marked, so the pristine and touch rules refuse
 * such a fixture rather than vouch for the control or blame it.
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
  const kinds = MODEL_KINDS.filter(kind => control.models.some(model => model.publicName === kind));
  if (kinds.length > 1) {
    const bound = (control.models[0] as ModelBinding).publicName;
    const dead = bound === 'value' ? 'checked' : 'value';
    throw new SignalFormsControlError(
      'single-model',
      control.label,
      `${control.name} offers BOTH a \`value\` and a \`checked\` model${throughHostDirectives(control)}.\n\n` +
        "Angular binds the first it finds — a control's own pair before an exposed one, and\n" +
        `\`value\` before \`checked\` — so \`${bound}\` is bound and the \`${dead}\` model is never written\n` +
        "and never read: a dead input that looks live in the template. Angular's own contract\n" +
        'says as much in the types: FormValueControl declares `checked?: undefined` and\n' +
        'FormCheckboxControl declares `value?: undefined`.\n\n' +
        'Pick the one that is the form value and give the other idea its own name.',
    );
  }
  if (kinds.length === 0) {
    throw new SignalFormsControlError('value-model', control.label, noModel(control));
  }

  // Angular's own order of preference, which `models` is already in.
  const binding = control.models[0] as ModelBinding;
  const kind = binding.publicName;
  const model = read(node, binding);
  if (!isWritableSignal(model)) {
    throw new SignalFormsControlError(
      'value-model',
      control.label,
      `${control.name} has a \`${kind}\` input and a \`${kind}Change\` output, but the property\n` +
        `behind them, \`${binding.declaredOn.name}.${binding.property}\`, is not a writable signal.\n\n` +
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

  // 7. A value the form writes leaves a pristine field pristine.
  const state = control.formField.state();
  const { inbound, outbound, source } = probeValues(kind, state.controlValue(), options.values);
  await requireWriteKeepsPristine(fixture, control, state, inbound, source);

  // 8. The value crosses in both directions.
  //
  // What this proves that reading the definitions does not: that the model
  // resolved from them is the model Angular CONNECTED. The resolution mirrors
  // Angular's through private fields that can move between minors, and this is
  // where a drift shows rather than passing.
  //
  // The inbound half is judged on the write rule 7 has just made, and is the
  // other half of what makes that rule's pass mean anything: a write that never
  // reached the model leaves the field pristine too, because nothing came back
  // to dirty it. A control that changes the value on the way in and reports the
  // change has already failed rule 7, so what is left to find here is a model
  // the write did not reach.
  if (!Object.is(model(), inbound)) {
    throw new SignalFormsControlError(
      'value-round-trip',
      control.label,
      `The form wrote ${show(inbound)}, the field is still pristine, and ${control.name}'s \`${binding.publicName}\`\n` +
        `reports ${show(model())}.\n\n` +
        'Had the control changed the value and reported the change, the field would be dirty.\n' +
        'Nothing came back, so either the inbound half of the binding is not connected — the\n' +
        'model resolved from the definitions is not the one Angular bound — or the control\n' +
        'changed its value and the change never reached the field, which leaves the two\n' +
        'disagreeing about what the form holds.',
    );
  }

  // The outbound half reads `controlValue` rather than `value`, because
  // `controlValue` is the signal the binding reads and writes. On a plain field
  // the two are the same; under `transformedValue` they are not, and comparing
  // against `value` would report a working control as broken for doing exactly
  // what the schema asked.
  model.set(outbound);
  await flush(fixture);
  if (!Object.is(state.controlValue(), outbound)) {
    throw new SignalFormsControlError(
      'value-round-trip',
      control.label,
      `${control.name} set \`${binding.publicName}\` to ${show(outbound)} and the field reads ${show(state.controlValue())}.\n\n` +
        'Either the outbound half is not connected, or the control changed the value again after\n' +
        'it was set.\n\n' +
        'The first is the asymmetry worth testing for: a control that accepts a programmatic\n' +
        'write and never reports an edit back looks entirely correct on screen. It renders the\n' +
        'right value, it follows `[formField]`, and the form it is bound to keeps whatever it\n' +
        'started with for the life of the page.\n\n' +
        'The second is a control that normalises — coerces, clamps, trims — and reports the\n' +
        'adjusted value. If it does that on purpose, pass `values` with two values it keeps.',
    );
  }

  // 9. `touch` reaches the field. After the round trip, because it cannot be
  // undone.
  //
  // Two states of the FIELD make this unanswerable, and each is refused rather
  // than reported against the control: a field that cannot be touched, and one
  // that already is. `markAsTouched` still records the touch on a hidden,
  // disabled or read-only field, but `touched` masks it with the field's
  // `isNonInteractive` and reads false there, so a probe on one fails for a
  // wired control exactly as for an unwired one. Rule 7 has refused such a
  // field already, and asks again here because a schema that reads the value
  // can make one out of the value the round trip has just written.
  const inert = nonInteractive(state);
  if (inert.length > 0) {
    throw new SignalFormsControlError(
      'touch-marks-touched',
      control.label,
      `The bound field is ${inert.join(' and ')}, so it cannot be touched: Signal Forms reads\n` +
        '`touched` as false on a hidden, disabled or read-only field, whatever the control\n' +
        "emits. A failure here would blame the control for the fixture's schema, and a pass\n" +
        'is impossible.\n\n' +
        'Bind the control to a field the schema leaves interactive, in a fixture of its own.',
    );
  }
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
  // Any one of them: Angular subscribes to the control's own `touch` and to
  // every one its host directives expose, so emitting the first is enough.
  (read(node, (control.outputs.get('touch') ?? [])[0] as Member) as OutputEmitterRef<void>).emit();
  await flush(fixture);
  if (!state.touched()) {
    throw new SignalFormsControlError(
      'touch-marks-touched',
      control.label,
      `${control.name} emitted \`touch\` and the field is still untouched.\n\n` +
        'The definitions say Angular subscribes to it, and Angular did not. The usual cause is\n' +
        "a directive the template applies by hand that is also one of the control's host\n" +
        "directives: Angular then treats it as the template's own and drops the exposure the\n" +
        'control declared, which nothing in a definition shows. The other is an emitter\n' +
        'replaced after Angular subscribed to the one the instance started with.',
    );
  }

  // 10. Focus reaches the control. After `touch`, because moving focus in and
  // out of a control is exactly what makes a conforming one emit `touch`, and
  // the touch rule needs a field nobody has touched yet.
  await requireFocusReachesControl(fixture, control, node);
}

/**
 * Rule 7: write from the form's side, and look at whether the field calls it an
 * edit.
 *
 * Twice. The first render is a form-side write already — Angular hands the
 * control the value the field starts with — so a control that adjusts what it
 * is handed has done it by the time the assertion looks, and the field is
 * dirty. Then the first probe value goes in through the field's own
 * `value.set`, which is what a load or a patch does. `controlValue.set` would
 * not do here: it is the call Angular makes when the CONTROL reports a value,
 * and it marks the field dirty itself, whoever calls it.
 *
 * Neither read can pass for the wrong reason without the next rule failing.
 * When the probe equals the value the field started with, the write changes
 * nothing, and the render has already put that value to the control. When the
 * write does not reach the model at all, the field stays pristine because
 * nothing came back, and the round trip, judged on this same write, fails on
 * the line after.
 *
 * What can make a read meaningless is the schema. `dirty` is masked by the
 * field's `isNonInteractive` exactly as `touched` is, so on a hidden, disabled
 * or read-only field it reads false whatever the control wrote back, and a pass
 * there would vouch for any control at all. The field is asked again after the
 * probe write, because a schema that reads the value can turn the field
 * read-only for the very value the probe wrote.
 */
async function requireWriteKeepsPristine<T>(
  fixture: ComponentFixture<T>,
  control: LocatedControl,
  state: FieldState<unknown>,
  probe: unknown,
  source: ProbeSource,
): Promise<void> {
  refuseNonInteractive(state, control, '');
  if (state.dirty()) {
    throw new SignalFormsControlError(
      'write-keeps-pristine',
      control.label,
      `${control.name} has been rendered once and nothing has edited it, and the field is already\n` +
        `dirty, holding ${show(state.controlValue())}.\n\n` +
        "The first render is a write from the form's side: Signal Forms hands the control the\n" +
        'value the field starts with, and a field nobody has edited is dirty only when a value\n' +
        `came back.\n\n${WRITTEN_BACK}\n\n` +
        `${FIX_THE_DISPLAY}\n\n` +
        'The value is the one the fixture started the field with. A control converting a value\n' +
        'no form would ever hold for it — a number started in a text control — is a false\n' +
        'failure: start the field at a value the control is built for. A value outside its range\n' +
        'is not one of those, because forms load those, and they are what this rule is for. And\n' +
        'a test that wrote to the field before handing the fixture over reads exactly like this.',
    );
  }

  state.value.set(probe);
  await flush(fixture);
  refuseNonInteractive(state, control, ` once the form has written ${show(probe)} into it`);
  if (state.dirty()) {
    throw new SignalFormsControlError(
      'write-keeps-pristine',
      control.label,
      `The form wrote ${show(probe)} into the pristine field, the way a load or a patch writes, and\n` +
        `${control.name} reported ${show(state.controlValue())} back: the field now holds that and is dirty.\n\n` +
        `${WRITTEN_BACK}\n\n` +
        FIX_THE_DISPLAY +
        PROBE_HINT[source],
    );
  }
}

/**
 * Where the value rule 7 wrote came from, which decides the one piece of advice
 * that differs: an anonymous object is ngtrue's choice and a false failure for
 * a control that converts, `values` is the caller's, and a flipped boolean is
 * nothing a checkbox has any business adjusting.
 */
const PROBE_HINT: Readonly<Record<ProbeSource, string>> = {
  anonymous:
    "\n\nThe value written was ngtrue's default probe, an anonymous object. A control that\n" +
    'converts what it is given on purpose will rightly change that, and no form will ever\n' +
    'hand it one: pass `values` whose first value is one the control keeps as written. If\n' +
    'it clamps, make that value one outside its range: a control that leaves its model alone\n' +
    'keeps that as written too, and forms load those.',
  supplied:
    '\n\nThe value written is the first of `values`. If the control converts it on purpose,\n' +
    'because no form would ever hold that value for this control, pass a first value one\n' +
    "would. A value outside the control's range is not one of those: forms load those.",
  flipped: '',
};

/** What a control that adjusts what it was handed does to a form, said once for both reads of rule 7. */
const WRITTEN_BACK =
  "Signal Forms records every value a control reports through its model as the user's\n" +
  'edit, so a control that adjusts what it was handed and writes the adjustment back —\n' +
  'normalising it, `null` to an empty string; clamping it into range; filling a `null` in\n' +
  'with a default — marks the field dirty before anyone has touched it. An unsaved-changes\n' +
  'guard then fires on a page nobody edited, and the value the form loaded is silently\n' +
  'replaced.';

/** The fix, which is the same for both reads of rule 7. */
const FIX_THE_DISPLAY =
  'Adjust what the control SHOWS and leave the model alone: clamp the display, render a\n' +
  '`null` as an empty input, and write the model only on the paths a user drives. Whether\n' +
  "the value is acceptable is a validator's to say — `max()` on the schema reports the\n" +
  'out-of-range value that a clamp written back would have deleted.';

/**
 * The refusal rule 7 makes before each read of `dirty`, when the schema has
 * made the field one on which `dirty` cannot be anything but false.
 */
function refuseNonInteractive(state: FieldState<unknown>, control: LocatedControl, moment: string): void {
  const inert = nonInteractive(state);
  if (inert.length === 0) return;
  throw new SignalFormsControlError(
    'write-keeps-pristine',
    control.label,
    `The bound field is ${inert.join(' and ')}${moment}, so it cannot be dirty:\n` +
      'Signal Forms reads `dirty` as false on a hidden, disabled or read-only field, whatever\n' +
      'the control writes back, and `touched` the same way. A pass here would vouch for any\n' +
      'control at all, so there is no answer rather than that one.\n\n' +
      'Bind the control to a field the schema leaves interactive, in a fixture of its own.',
  );
}

/** The states of the field that mask `dirty` and `touched`, as `isNonInteractive` in Signal Forms reads them. */
function nonInteractive(state: FieldState<unknown>): readonly ('hidden' | 'disabled' | 'readonly')[] {
  return (['hidden', 'disabled', 'readonly'] as const).filter(name => state[name]());
}

/**
 * Rule 10: ask the field to focus its control, and look at where focus went.
 *
 * It calls `focus()` on the candidate's own `FormField`, which is the call
 * `focusBoundControl()` ends in — the field state picks its first binding in
 * DOM order and calls exactly this. Going through the state instead would let
 * a second binding of the same field, earlier in the template, answer for the
 * candidate.
 *
 * Angular's half is short: the control's `focus` member when it has one,
 * otherwise `focus()` on the host element. Neither says anything when nothing
 * happens, which is why the outcome is read off the document rather than
 * inferred from which branch ran.
 *
 * Two guards keep a pass meaningful. Focus has to START outside the host — it
 * is blurred first, and the rule refuses to go on if it will not leave —
 * because a probe that begins with focus inside answers yes for a `focus()`
 * that does nothing at all. And the host has to be attached, because nothing
 * detached can take focus: a detached fixture would fail a sound control, for
 * a reason that belongs to the fixture.
 */
async function requireFocusReachesControl<T>(
  fixture: ComponentFixture<T>,
  control: LocatedControl,
  node: DebugElement,
): Promise<void> {
  const host = node.nativeElement as Element;
  if (!host.isConnected) {
    throw new SignalFormsControlError(
      'focus-reaches-control',
      control.label,
      'The control is not attached to a document, and nothing detached can take focus, so this\n' +
        'rule would fail a sound control for a reason that belongs to the fixture.\n\n' +
        '`TestBed.createComponent` attaches what it creates. Give this assertion a fixture that is\n' +
        'still in the document — not one whose element was removed, nor one built by a\n' +
        'TestComponentRenderer that never inserts it.',
    );
  }

  const ownerDocument = host.ownerDocument;
  blur(ownerDocument.activeElement);
  await flush(fixture);
  if (contains(host, ownerDocument.activeElement)) {
    throw new SignalFormsControlError(
      'focus-reaches-control',
      control.label,
      `Focus was already inside ${control.name} and blurring it did not move it out, so a pass\n` +
        'would have meant nothing: a `focus()` that does nothing at all leaves focus exactly where\n' +
        'it found it.\n\n' +
        'Either something inside takes focus back as it leaves — a blur handler that calls\n' +
        '`focus()` again, which is a keyboard trap (WCAG 2.1.2) wherever it happens — or focus\n' +
        "sits inside the control's shadow root, which blurring the host it is reported as does\n" +
        'not reach.',
    );
  }

  try {
    control.formField.focus();
  } catch (error) {
    throw new SignalFormsControlError(
      'focus-reaches-control',
      control.label,
      `Asking the field to focus ${control.name} threw, so \`focusBoundControl()\` throws as well —\n` +
        'out of whatever submit handler called it to take the user to the first invalid field.\n\n' +
        'The usual cause is a `focus()` reaching for an element that is not rendered yet, such as\n' +
        'a required view query read while its `@if` is false. Render first and focus after.\n' +
        "Angular's own words follow.\n\n" +
        indent(messageOf(error)),
    );
  }
  // Flushed before reading, because a `focus()` may rightly finish in a render
  // hook: one that switches an inline editor into edit mode has to wait for the
  // input it is about to focus to exist.
  await flush(fixture);

  const landed = ownerDocument.activeElement;
  if (contains(host, landed)) return;

  // Truthiness, because that is the test Angular applies when it registers the
  // binding: a `focus` member holding `null` is no member at all, and Angular
  // falls back to the host. `!== undefined` would print the wrong explanation.
  // Read off the control itself, which is the instance Angular registers: a
  // `focus` on one of its host directives is never looked at, and is named
  // below so the explanation does not call a method missing that is right there.
  const declaresFocus = Boolean(read(node, { declaredOn: control.type, property: 'focus' }));
  const focusOnHosts = declaresFocus
    ? []
    : hostDirectivesOf(definitionOf(control.type) as DirectiveDefinition)
        .map(host => host.type)
        .filter(type => Boolean(read(node, { declaredOn: type, property: 'focus' })));
  throw new SignalFormsControlError(
    'focus-reaches-control',
    control.label,
    `The field was asked to focus ${control.name}, and focus is on ${where(landed)}.\n\n` +
      (declaresFocus
        ? `${control.name} declares \`focus\` and Angular called it, but focus did not end up on the\n` +
          'host or inside it. Either it focused something that cannot take focus — not rendered\n' +
          'yet, disabled, hidden, detached, or a host with no tab stop — or it moved focus outside\n' +
          "the host, to an overlay panel, say, which leaves the field's own element unfocused. A\n" +
          'signal input named `focus` is the quiet version of this: Angular calls whatever the\n' +
          'member holds, and reading an input moves nothing.\n\n' +
          'Focus that arrives from a timer is reported here too. This rule waits for the render\n' +
          'after the call and nothing later, so a `focus()` deferred with `setTimeout` reads as a\n' +
          'miss; `afterNextRender` is the deferral it waits for.\n\n' +
          'Forward it to the element inside the host that takes input.'
        : `${control.name} declares no \`focus()\`, so Angular fell back to focusing the host element,\n` +
          'and the host did not take it. An element that is not a form control and has no tab\n' +
          'stop — a custom element, a `<div>` — is not focusable, and the call does nothing without\n' +
          'saying so: `focusBoundControl()`, which a form calls to take the user to the first\n' +
          'invalid field after a failed submit, returns normally and leaves them where they were.\n\n' +
          (focusOnHosts.length === 0
            ? ''
            : `\`focus\` is declared on ${list(focusOnHosts.map(type => type.name))}, a host directive of ${control.name}, and\n` +
              'Angular never calls it: it registers the directive the template matched and reads\n' +
              '`focus` off that alone. An input or an output can be exposed from a host directive;\n' +
              `a method cannot, so what follows applies to ${control.name} itself.\n\n`) +
          'Declare `focus(options?: FocusOptions)` and forward it to the element that takes input,\n' +
          '`this.input().nativeElement.focus(options)`. A tab stop on the host is the fix only when\n' +
          'the host itself is the interactive element — a `role="slider"` host, say.'),
  );
}

const MODEL_KINDS = ['value', 'checked'] as const;
type ModelKind = (typeof MODEL_KINDS)[number];

/**
 * Where Angular delivers one public name on the element: the class that
 * declares it — the control itself, or one of its host directives — and the
 * class property behind it, which an alias or an exposure may have renamed.
 */
interface Member {
  readonly declaredOn: Type<unknown>;
  readonly property: string;
}

interface ModelBinding extends Member {
  readonly publicName: ModelKind;
}

/**
 * The runtime directive definition, read the way Angular reads it.
 *
 * `inputs` and `outputs` are keyed by PUBLIC name and hold the class property
 * name — `{ formField: ['field', 1, null] }` for a `field` input aliased to
 * `formField`. Reading the definition rather than the class also means
 * inherited members are seen, since `ɵɵInheritDefinitionFeature` has merged a
 * base class in by the time there is a definition to read. A base class's
 * `hostDirectives` come with it, because `ɵɵHostDirectivesFeature` is marked
 * to be inherited.
 */
interface DirectiveDefinition {
  readonly inputs?: Record<string, string | readonly unknown[]>;
  readonly outputs?: Record<string, string>;
  readonly hostDirectives?: readonly HostDirectiveEntry[] | null;
}

/**
 * One entry of a definition's `hostDirectives`, as `ɵɵHostDirectivesFeature`
 * leaves it: already resolved when the decorator named its directives directly,
 * or the compiler's thunk when any of them went through `forwardRef`.
 */
type HostDirectiveEntry = HostDirectiveDefinition | (() => readonly HostDirectiveConfig[]);

/** The resolved form. Exposure maps the directive's own public name to the name on the element. */
interface HostDirectiveDefinition {
  readonly directive: Type<unknown>;
  readonly inputs: Readonly<Record<string, string>>;
  readonly outputs: Readonly<Record<string, string>>;
}

/** What the thunk returns: a bare type, or a config whose exposure is flat `[own, exposed, …]` pairs. */
type HostDirectiveConfig =
  | Type<unknown>
  | { readonly directive: Type<unknown>; readonly inputs?: readonly string[]; readonly outputs?: readonly string[] };

/** A host directive somewhere beneath a control, with everything its entries expose merged. */
interface ResolvedHostDirective {
  readonly type: Type<unknown>;
  readonly def: DirectiveDefinition;
  readonly inputs: Record<string, string>;
  readonly outputs: Record<string, string>;
}

/** The control as Angular binds it: one directive, plus whatever its host directives expose. */
interface LocatedControl {
  readonly formField: FormField<unknown>;
  readonly type: Type<unknown>;
  readonly name: string;
  readonly label: string;
  /** Every model pair on offer, in the order Angular prefers them; the first is the one it binds. */
  readonly models: readonly ModelBinding[];
  /** Each input Angular writes on the control's behalf, by the name on the element. */
  readonly inputs: ReadonlyMap<string, readonly Member[]>;
  readonly outputs: ReadonlyMap<string, readonly Member[]>;
  /** Names a host directive declares and does not expose, with the directives that declare them. */
  readonly unexposedInputs: ReadonlyMap<string, readonly Type<unknown>[]>;
  readonly unexposedOutputs: ReadonlyMap<string, readonly Type<unknown>[]>;
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
        'anything else is not one. A control assembled from host directives needs both halves\n' +
        'exposed by the SAME host directive — `value` in the `inputs` of its `hostDirectives`\n' +
        "entry and `valueChange` in the `outputs`. Angular's own words follow.\n\n" +
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
 * The control on the bound node, resolved the way Angular resolves it.
 *
 * A control may be a component (`<my-rating>`) or a directive on someone else's
 * element, so this cannot simply read `componentInstance`; and a node may carry
 * several directives, some of them there only as another's host directives.
 * Angular looks for the control among the directives the TEMPLATE matched and
 * treats each one's host directives as part of it — `initializeCustomControlStatus`
 * in `@angular/core` takes a matched directive's own model first, and only then
 * a pair exposed through `hostDirectiveInputs` / `hostDirectiveOutputs`, and
 * the control it records is the matched directive either way. This does the
 * same, so a host directive is never a candidate on its own and its unexposed
 * members never count.
 */
function describeControl(node: DebugElement): LocatedControl {
  const formField = node.injector.get(FormField, null, { self: true, optional: true }) as FormField<unknown>;

  // Every directive on the node, in node order: `providerTokens` walks the
  // node's slice of the view, host directives included.
  const seen = new Set<Type<unknown>>();
  const onNode: Type<unknown>[] = [];
  const component = node.componentInstance as object | null;
  for (const token of [...((node.providerTokens ?? []) as unknown[]), component?.constructor]) {
    if (typeof token !== 'function') continue;
    const type = token as Type<unknown>;
    if (seen.has(type) || type === FormField) continue;
    seen.add(type);
    if (definitionOf(type) !== null) onNode.push(type);
  }

  // The template's own directives are the ones nothing on the node composes.
  // A directive that is BOTH matched by the template and one of another's host
  // directives lands on the composed side here, where Angular keeps it on the
  // template's — the definitions cannot tell the two apart, and the JSDoc on
  // `assertSignalFormsControl` says what follows, which driven rule catches it,
  // and the one case none does.
  const composed = new Set(
    onNode.flatMap(type => hostDirectivesOf(definitionOf(type) as DirectiveDefinition).map(host => host.type)),
  );
  const matched = onNode.filter(type => !composed.has(type));
  const surfaces = matched.map(type => surfaceOf(type, definitionOf(type) as DirectiveDefinition));

  const withModel = surfaces.filter(surface => surface.models.length > 0);
  if (withModel.length > 1) {
    throw new SignalFormsControlError(
      'single-model',
      `<${tag(node)}>`,
      `Two directives on this element offer a model: ${list(withModel.map(modelSource))}.\n\n` +
        'Angular binds the first in directive order and leaves the other inert, so which of\n' +
        'them is the control depends on declaration order rather than on intent. Put the\n' +
        'model on one of them.',
    );
  }

  // With no model anywhere, carry on with the first directive on the node so the
  // `value-model` rule can name it and print what it did declare. Reporting "no
  // control found" would describe the fixture, when what is wrong is the class.
  const surface = withModel[0] ?? surfaces[0];
  if (surface === undefined) {
    throw new SignalFormsControlError(
      'value-model',
      `<${tag(node)}>`,
      'This element carries [formField] and no other directive at all, so there is no\n' +
        'candidate control on it to check.',
    );
  }

  return { ...surface, formField, label: `<${tag(node)}> (${surface.name})` };
}

type Surface = Omit<LocatedControl, 'formField' | 'label'>;

/**
 * Everything one matched directive offers Angular: its own inputs and outputs,
 * then every name a host directive beneath it exposes.
 *
 * The members are what `setInputOnDirectives` writes and `listenToDirectiveOutput`
 * subscribes to in `@angular/core` — the directive's own definition, and the
 * `hostDirectiveInputs` / `hostDirectiveOutputs` Angular builds from each
 * entry's exposure. Model pairs follow `initializeCustomControlStatus`: the
 * directive's own `value` pair, then its own `checked` pair, then a pair ONE
 * host directive exposes in full, `value` before `checked`.
 */
function surfaceOf(type: Type<unknown>, def: DirectiveDefinition): Surface {
  const inputs = new Map<string, Member[]>();
  const outputs = new Map<string, Member[]>();
  const unexposedInputs = new Map<string, Type<unknown>[]>();
  const unexposedOutputs = new Map<string, Type<unknown>[]>();

  for (const [name, entry] of Object.entries(def.inputs ?? {})) {
    add(inputs, name, { declaredOn: type, property: propertyOf(entry) });
  }
  for (const [name, property] of Object.entries(def.outputs ?? {})) {
    add(outputs, name, { declaredOn: type, property });
  }

  const own: ModelBinding[] = [];
  for (const kind of MODEL_KINDS) {
    const input = def.inputs?.[kind];
    if (input !== undefined && Object.hasOwn(def.outputs ?? {}, `${kind}Change`)) {
      own.push({ publicName: kind, declaredOn: type, property: propertyOf(input) });
    }
  }

  const exposed: ModelBinding[] = [];
  for (const host of hostDirectivesOf(def)) {
    for (const [ownName, onElement] of Object.entries(host.inputs)) {
      const entry = host.def.inputs?.[ownName];
      if (entry !== undefined) add(inputs, onElement, { declaredOn: host.type, property: propertyOf(entry) });
    }
    for (const [ownName, onElement] of Object.entries(host.outputs)) {
      const property = host.def.outputs?.[ownName];
      if (property !== undefined) add(outputs, onElement, { declaredOn: host.type, property });
    }
    for (const name of Object.keys(host.def.inputs ?? {})) {
      if (!Object.hasOwn(host.inputs, name)) add(unexposedInputs, name, host.type);
    }
    for (const name of Object.keys(host.def.outputs ?? {})) {
      if (!Object.hasOwn(host.outputs, name)) add(unexposedOutputs, name, host.type);
    }
    for (const kind of MODEL_KINDS) {
      const input = ownNameExposedAs(host.inputs, kind);
      const output = ownNameExposedAs(host.outputs, `${kind}Change`);
      const entry = input === undefined ? undefined : host.def.inputs?.[input];
      if (entry !== undefined && output !== undefined) {
        exposed.push({ publicName: kind, declaredOn: host.type, property: propertyOf(entry) });
      }
    }
  }

  const fromHosts = MODEL_KINDS.flatMap(kind => exposed.filter(model => model.publicName === kind));
  return {
    type,
    name: type.name,
    models: [...own, ...fromHosts],
    inputs,
    outputs,
    unexposedInputs,
    unexposedOutputs,
  };
}

/**
 * Every host directive beneath a definition, at any depth, the way Angular's
 * `findHostDirectiveDefs` collects them: nested ones first, an entry of the
 * function form resolved through `forwardRef`, and two entries naming the same
 * directive merged into one.
 *
 * The merge here is not redundant with Angular's. Angular merges by writing
 * into the entry it met first; for the resolved form that entry is stored on a
 * definition, so the union is already there by the time anything reads it
 * (and leaks to other components, which the public JSDoc describes). For the
 * function form each call builds fresh entries and nothing is written back, so
 * a reader has to merge for itself.
 *
 * This follows the walk that decides what Angular WRITES, not
 * `customControlHasInput`, which answers a narrower question and differs in one
 * place: it skips a bare type inside the function form without looking beneath
 * it. That method decides only whether a native element also gets the DOM
 * property, while the input itself is written either way — so a rule about the
 * input has to follow the write. Pinned against the installed Angular in the
 * conformance suite's own spec.
 *
 * It throws rather than reading a shape it does not recognise as empty, and
 * that is the honest-check rule applied to the walk itself. Every definition
 * Angular builds carries `hostDirectives`, `null` when there are none, so a
 * definition WITHOUT the key is one whose layout has moved. Reading it as "no
 * host directives" would put each host directive among the template's own and
 * make it a candidate control — and a host directive holding a complete control
 * is exactly what a component that forgot to expose `readonly` composes, so the
 * wrong reading passes the case the walk exists to fail.
 */
function hostDirectivesOf(def: DirectiveDefinition): readonly ResolvedHostDirective[] {
  const found = new Map<Type<unknown>, ResolvedHostDirective>();
  const visited = new Set<DirectiveDefinition>();

  const visit = (current: DirectiveDefinition): void => {
    if (visited.has(current)) return;
    visited.add(current);
    if (!Object.hasOwn(current, 'hostDirectives')) throw unreadable('a definition with no `hostDirectives` field');
    for (const entry of current.hostDirectives ?? []) {
      if (typeof entry === 'function') {
        for (const config of entry()) track(resolveConfig(config));
      } else {
        track(entry);
      }
    }
  };

  const track = (entry: HostDirectiveDefinition): void => {
    // Angular refuses a host directive with no definition (NG0307) while it
    // renders, so an entry naming one means the entry's layout has moved, not
    // that the fixture is wrong — and skipping it would hand that directive to
    // the template's side, the same wrong reading as above.
    const hostDef = typeof entry.directive === 'function' ? definitionOf(entry.directive) : null;
    if (hostDef === null) throw unreadable('a `hostDirectives` entry that names no directive');
    visit(hostDef);
    const existing = found.get(entry.directive);
    if (existing === undefined) {
      found.set(entry.directive, {
        type: entry.directive,
        def: hostDef,
        inputs: { ...entry.inputs },
        outputs: { ...entry.outputs },
      });
    } else {
      Object.assign(existing.inputs, entry.inputs);
      Object.assign(existing.outputs, entry.outputs);
    }
  };

  visit(def);
  return [...found.values()];
}

/** The refusal {@link hostDirectivesOf} throws when Angular's layout is not the one it reads. */
function unreadable(found: string): Error {
  return new Error(
    `ngtrue: cannot read how this control is composed — it found ${found}.\n\n` +
      'The host-directive rules read fields Angular keeps private, and this version of\n' +
      'Angular lays them out differently from the one ngtrue was written against. Reading\n' +
      'the unknown shape as "no host directives" would count each host directive as a\n' +
      'control of its own and could pass one whose `disabled` or `readonly` Angular never\n' +
      'writes, so there is no answer here rather than a wrong one. Report it against ngtrue\n' +
      'with the Angular version installed.',
  );
}

function resolveConfig(config: HostDirectiveConfig): HostDirectiveDefinition {
  if (typeof config === 'function') return { directive: resolveForwardRef(config), inputs: {}, outputs: {} };
  return {
    directive: resolveForwardRef(config.directive),
    inputs: pairs(config.inputs),
    outputs: pairs(config.outputs),
  };
}

function pairs(flat: readonly string[] | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (let i = 0; flat !== undefined && i < flat.length; i += 2) {
    const own = flat[i];
    const onElement = flat[i + 1];
    if (own !== undefined && onElement !== undefined) map[own] = onElement;
  }
  return map;
}

function ownNameExposedAs(exposure: Readonly<Record<string, string>>, onElement: string): string | undefined {
  return Object.keys(exposure).find(own => exposure[own] === onElement);
}

function propertyOf(entry: string | readonly unknown[]): string {
  return typeof entry === 'string' ? entry : (entry[0] as string);
}

function add<T>(map: Map<string, T[]>, key: string, value: T): void {
  const values = map.get(key);
  if (values === undefined) map.set(key, [value]);
  else values.push(value);
}

function definitionOf(type: Type<unknown>): DirectiveDefinition | null {
  const holder = type as unknown as { ɵcmp?: DirectiveDefinition; ɵdir?: DirectiveDefinition };
  return holder.ɵcmp ?? holder.ɵdir ?? null;
}

/** The instance member a {@link Member} names, off the directive on the bound node that declares it. */
function read(node: DebugElement, member: Member): unknown {
  const instance = node.injector.get(member.declaredOn, null, { self: true, optional: true });
  if (instance === null) {
    throw new Error(
      `ngtrue: ${member.declaredOn.name} is declared on <${tag(node)}> but could not be injected from it.`,
    );
  }
  return (instance as Record<string, unknown>)[member.property];
}

/** "MyControl", or "MyControl (through its host directive ValueState)" when the model is exposed. */
function modelSource(surface: Surface): string {
  const model = surface.models[0];
  return model === undefined || model.declaredOn === surface.type
    ? surface.name
    : `${surface.name} (through its host directive ${model.declaredOn.name})`;
}

function throughHostDirectives(control: LocatedControl): string {
  const hosts = [...new Set(control.models.map(model => model.declaredOn))].filter(type => type !== control.type);
  return hosts.length === 0 ? '' : `, counting what ${list(hosts.map(type => type.name))} exposes`;
}

function noModel(control: LocatedControl): string {
  return (
    `${control.name} declares neither a \`value\` nor a \`checked\` model.\n\n` +
    'Angular finds a custom control by name: an input `value` beside a `valueChange` output,\n' +
    'or `checked` beside `checkedChange`. A `model()` declares both at once, which is why it\n' +
    'is the idiom.\n\n' +
    `Inputs seen: ${list([...control.inputs.keys()])}\n` +
    `Outputs seen: ${list([...control.outputs.keys()])}\n\n` +
    'If the names look right, check for an alias — Angular matches the PUBLIC binding name.'
  );
}

function requireInput(control: LocatedControl, name: string, rule: SignalFormsControlRule, why: string): void {
  if (control.inputs.has(name)) return;
  throw new SignalFormsControlError(
    rule,
    control.label,
    `${control.name} has no \`${name}\` input that Angular writes.\n\n` +
      unexposed(control, control.unexposedInputs.get(name), name, 'inputs') +
      `${why}\n\n` +
      `Inputs seen: ${list([...control.inputs.keys()])}`,
  );
}

function requireOutput(control: LocatedControl, name: string, rule: SignalFormsControlRule, why: string): void {
  if (control.outputs.has(name)) return;
  throw new SignalFormsControlError(
    rule,
    control.label,
    `${control.name} has no \`${name}\` output that Angular subscribes to.\n\n` +
      unexposed(control, control.unexposedOutputs.get(name), name, 'outputs') +
      `${why}\n\n` +
      `Outputs seen: ${list([...control.outputs.keys()])}`,
  );
}

/**
 * The one sentence that turns "missing" into the actual mistake when the member
 * exists on a host directive: it was declared and not exposed, which reads as
 * complete in the directive's class and is invisible to Angular.
 */
function unexposed(
  control: LocatedControl,
  declaredBy: readonly Type<unknown>[] | undefined,
  name: string,
  kind: 'inputs' | 'outputs',
): string {
  if (declaredBy === undefined || declaredBy.length === 0) return '';
  return (
    `\`${name}\` is declared on ${list(declaredBy.map(type => type.name))}, a host directive of ${control.name}, and is\n` +
    'not exposed. Angular binds a host directive member only when the `hostDirectives`\n' +
    `entry lists it, so add \`'${name}'\` to that entry's \`${kind}\`.\n\n`
  );
}

/** The caller's `values`, the field's boolean flipped, or two anonymous objects. */
type ProbeSource = 'supplied' | 'flipped' | 'anonymous';

function probeValues(
  kind: ModelKind,
  current: unknown,
  supplied: readonly [unknown, unknown] | undefined,
): { readonly inbound: unknown; readonly outbound: unknown; readonly source: ProbeSource } {
  if (supplied !== undefined) return { inbound: supplied[0], outbound: supplied[1], source: 'supplied' };
  if (kind === 'checked' || typeof current === 'boolean') {
    return { inbound: !current, outbound: current, source: 'flipped' };
  }
  return { inbound: { ngtrue: 'probe-a' }, outbound: { ngtrue: 'probe-b' }, source: 'anonymous' };
}

function blur(element: Element | null): void {
  (element as { blur?: () => void } | null)?.blur?.();
}

function contains(host: Element, element: Element | null): boolean {
  return element !== null && host.contains(element);
}

function where(element: Element | null): string {
  return element === null ? 'nothing at all' : `<${element.tagName.toLowerCase()}>`;
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
