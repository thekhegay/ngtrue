import { Component, provideZonelessChangeDetection, signal, type Type } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { FormField, disabled, form, hidden, readonly, type SchemaPath } from '@angular/forms/signals';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  GoodAttribute,
  GoodText,
  GoodToggle,
  AliasedExposure,
  AliasedModel,
  AliasedState,
  BothModels,
  CheckedState,
  ClampsModel,
  ClampsShown,
  CoercesValue,
  ControlState,
  DiamondState,
  ExposedState,
  FocusAfterRender,
  FocusEscapes,
  FocusForwarder,
  FocusFromHost,
  FocusThrows,
  HalfExposedModel,
  HiddenState,
  HiddenTouch,
  HoldsFocus,
  ModelFromHost,
  NoDisabled,
  NoFocus,
  NoModel,
  NoReadonly,
  NormalisesNull,
  RelayedState,
  ScoreState,
  ShadowedModel,
  TouchFromHost,
  TouchSource,
  UnwritableModel,
  UsesShared,
  ValueAndExposedChecked,
  WholeControl,
  WidensShared,
  WithAccessor,
  WrongTouchName,
} from './fixtures/controls.js';
import {
  assertSignalFormsControl,
  SignalFormsControlError,
  type SignalFormsControlRule,
} from './signal-forms-control.js';

/**
 * The suite proving itself.
 *
 * A conformance check is only worth its name if a broken subject makes it fail
 * for the STATED reason, so every case here asserts the rule id rather than
 * that something threw — a check that failed for the wrong reason would pass a
 * test written as `expect(…).rejects.toThrow()`, and go on quietly reporting
 * the wrong rule to everyone who ever used it.
 */

/** A host binding one control, built per fixture class so each test gets a fresh field. */
function hostFor(
  control: Type<unknown>,
  template: string,
  initial: unknown = '',
  extra: readonly Type<unknown>[] = [],
): Type<unknown> {
  @Component({ template, imports: [control, ...extra, FormField] })
  class Host {
    readonly model = signal({ field: initial });
    readonly form = form(this.model);
  }
  return Host;
}

/** The factory form, which is how the assertion is meant to be called. */
function create(
  control: Type<unknown>,
  template: string,
  initial: unknown = '',
  extra: readonly Type<unknown>[] = [],
): () => ComponentFixture<unknown> {
  return () => TestBed.createComponent(hostFor(control, template, initial, extra));
}

/** The field a {@link hostFor} host binds, for the tests that read or write it directly. */
interface BoundField {
  controlValue: { (): unknown; set(value: unknown): void };
  touched: () => boolean;
  markAsTouched: () => void;
  focusBoundControl: () => void;
}

function fieldOf(fixture: ComponentFixture<unknown>): BoundField {
  return (fixture.componentInstance as { form: { field: () => BoundField } }).form.field();
}

/** A schema rule for the one field a {@link stateHost} binds. */
type FieldRule = (field: SchemaPath<string>) => void;

const DISABLED_AND_READONLY: FieldRule = field => {
  disabled(field);
  readonly(field);
};

/**
 * A host whose schema turns `disabled` and `readonly` ON, so what Angular
 * delivers can be read back off the directive that declares the input. The
 * assertion itself cannot do this — it is handed someone else's schema — which
 * is exactly why these tests exist: they pin the reading of Angular the
 * assertion's definition rules rest on, against the Angular installed.
 */
function stateHost(
  control: Type<unknown>,
  template: string,
  extra: readonly Type<unknown>[] = [],
  rule: FieldRule = DISABLED_AND_READONLY,
): Type<unknown> {
  @Component({ template, imports: [control, ...extra, FormField] })
  class Host {
    readonly model = signal({ field: '' });
    readonly form = form(this.model, path => {
      rule(path.field);
    });
  }
  return Host;
}

async function rendered(host: Type<unknown>): Promise<ComponentFixture<unknown>> {
  const fixture = TestBed.createComponent(host);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
}

function directive<T>(fixture: ComponentFixture<unknown>, type: Type<T>): T {
  const node = fixture.debugElement.query(By.directive(type));
  if (node === null) throw new Error(`${type.name} is not on any element in this fixture.`);
  return node.injector.get(type);
}

/** What reached `disabled` and `readonly` on the directive that declares them. */
function deliveredState(
  fixture: ComponentFixture<unknown>,
  holder: Type<{ disabled: () => boolean; readonly: () => boolean }>,
): readonly [boolean, boolean] {
  const instance = directive(fixture, holder);
  return [instance.disabled(), instance.readonly()];
}

/**
 * The error the assertion threw.
 *
 * Throwing when it did NOT throw matters: `await promise.catch(e => e)` yields
 * `undefined` on success, and every `expect(error.message).toContain(…)` after
 * it would then fail with a message about reading a property of undefined —
 * which reads like a bug in the test rather than a control that quietly passed
 * a rule it should have broken.
 */
async function errorFrom(run: Promise<void>): Promise<SignalFormsControlError> {
  try {
    await run;
  } catch (error) {
    if (error instanceof SignalFormsControlError) return error;
    throw error;
  }
  throw new Error('expected assertSignalFormsControl to fail, and it passed.');
}

/** Run the assertion and report which rule it named, or `null` when it passed. */
async function ruleBrokenBy(
  subject: ComponentFixture<unknown> | (() => ComponentFixture<unknown>),
): Promise<SignalFormsControlRule | null> {
  try {
    await assertSignalFormsControl(subject);
    return null;
  } catch (error) {
    if (error instanceof SignalFormsControlError) return error.rule;
    throw error;
  }
}

describe('assertSignalFormsControl', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  describe("Angular's own resolution, which the definition rules mirror", () => {
    // Every claim the host-directive walk makes about what Angular binds, held
    // against what the installed Angular actually binds. Should a minor release
    // move the resolution, these fail first and say where.

    it('writes an input a host directive exposes', async () => {
      const fixture = await rendered(stateHost(ExposedState, '<exposed-state [formField]="form.field" />'));
      expect(deliveredState(fixture, ControlState)).toEqual([true, true]);
    });

    it("writes a nested host directive's exposure, through the function form and a bare type", async () => {
      const fixture = await rendered(stateHost(RelayedState, '<relayed-state [formField]="form.field" />'));
      expect(deliveredState(fixture, ControlState)).toEqual([true, true]);
    });

    it('merges two entries for one host directive, and writes what either exposes', async () => {
      const fixture = await rendered(stateHost(DiamondState, '<diamond-state [formField]="form.field" />'));
      expect(deliveredState(fixture, ControlState)).toEqual([true, true]);
    });

    it('writes a merged exposure back into a shared definition, and every control on it follows', async () => {
      // One test rather than three, because the order is the subject: what
      // happens to UsesShared depends on whether WidensShared has rendered yet,
      // and Angular's change to the shared definition lasts for the rest of the
      // file. The JSDoc names this as the limit no driven rule can catch, and
      // this is what keeps that sentence true — when Angular stops writing into
      // a shared entry, the second half fails and the paragraph has to go.
      const control = '<uses-shared [formField]="form.field" />';
      expect(deliveredState(await rendered(stateHost(UsesShared, control)), ControlState)).toEqual([false, true]);
      expect(await ruleBrokenBy(create(UsesShared, control))).toBe('disabled-input');

      await rendered(hostFor(WidensShared, '<widens-shared />'));

      expect(deliveredState(await rendered(stateHost(UsesShared, control)), ControlState)).toEqual([true, true]);
      expect(await ruleBrokenBy(create(UsesShared, control))).toBeNull();
    });

    it('does not write an input a host directive declares and leaves unexposed', async () => {
      const fixture = await rendered(stateHost(HiddenState, '<hidden-state [formField]="form.field" />'));
      expect(deliveredState(fixture, WholeControl)).toEqual([false, false]);
    });

    it('binds the model a host directive exposes, under the alias it is exposed as', async () => {
      const fixture = await rendered(hostFor(ModelFromHost, '<model-from-host [formField]="form.field" />'));
      fieldOf(fixture).controlValue.set('in');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(directive(fixture, ScoreState).score()).toBe('in');

      directive(fixture, ScoreState).score.set('out');
      expect(fieldOf(fixture).controlValue()).toBe('out');
    });

    it("binds the component's own model and never an unexposed one beside it", async () => {
      const fixture = await rendered(hostFor(ShadowedModel, '<shadowed-model [formField]="form.field" />'));
      fieldOf(fixture).controlValue.set('in');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(directive(fixture, ShadowedModel).value()).toBe('in');
      expect(directive(fixture, WholeControl).value()).toBe('');
    });

    it('does not subscribe to a `touch` a host directive leaves unexposed', async () => {
      const fixture = await rendered(hostFor(HiddenTouch, '<hidden-touch [formField]="form.field" />'));
      directive(fixture, WholeControl).touch.emit();
      expect(fieldOf(fixture).touched()).toBe(false);

      // And the field itself can be touched, so the false above is about the
      // subscription rather than a field that ignores every touch.
      fieldOf(fixture).markAsTouched();
      expect(fieldOf(fixture).touched()).toBe(true);
    });

    it('drops an exposure when the template applies the same directive by hand', async () => {
      const composed = await rendered(hostFor(TouchFromHost, '<touch-from-host [formField]="form.field" />'));
      directive(composed, TouchSource).touch.emit();
      expect(fieldOf(composed).touched()).toBe(true);

      const byHand = await rendered(
        hostFor(TouchFromHost, '<touch-from-host touchSource [formField]="form.field" />', '', [TouchSource]),
      );
      directive(byHand, TouchSource).touch.emit();
      expect(fieldOf(byHand).touched()).toBe(false);
    });

    it('drops an ALIASED input exposure the same way, and the assertion cannot tell', async () => {
      // The limit the JSDoc names for `disabled` and `readonly`. The
      // definitions read the same with the attribute and without it, no driven
      // rule reaches either input, and so the assertion passes a fixture in
      // which Angular writes neither. When Angular stops dropping the aliased
      // exposure, the middle line fails and the paragraph has to go.
      const delivered = (fixture: ComponentFixture<unknown>): readonly [boolean, boolean] => {
        const state = directive(fixture, AliasedState);
        return [state.isDisabled(), state.isReadonly()];
      };
      const composed = '<aliased-exposure [formField]="form.field" />';
      const byHand = '<aliased-exposure aliasedState [formField]="form.field" />';

      expect(delivered(await rendered(stateHost(AliasedExposure, composed)))).toEqual([true, true]);
      expect(delivered(await rendered(stateHost(AliasedExposure, byHand, [AliasedState])))).toEqual([false, false]);
      expect(await ruleBrokenBy(create(AliasedExposure, byHand, '', [AliasedState]))).toBeNull();
    });

    it("binds the component's own `value` before a `checked` pair a host directive exposes", async () => {
      // What makes the exposed pair dead, and the `single-model` failure below
      // a real one rather than a preference.
      const fixture = await rendered(
        hostFor(ValueAndExposedChecked, '<value-and-exposed-checked [formField]="form.field" />'),
      );
      fieldOf(fixture).controlValue.set('in');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(directive(fixture, ValueAndExposedChecked).value()).toBe('in');
      expect(directive(fixture, CheckedState).checked()).toBe(false);
    });

    it('calls `focus` on the control, and never a `focus()` on one of its host directives', async () => {
      // What the focus rule's explanation rests on when the control declares
      // none: it reads `focus` off the directive the template matched and
      // names a host directive's as never called.
      const fixture = await rendered(hostFor(FocusFromHost, '<focus-from-host [formField]="form.field" />'));
      const inner = (fixture.nativeElement as HTMLElement).querySelector('focus-from-host input');
      fieldOf(fixture).focusBoundControl();
      expect(document.activeElement).not.toBe(inner);

      // And the forwarder does move focus when called, so the miss above is
      // Angular not calling it rather than a forwarder that moves nothing.
      directive(fixture, FocusForwarder).focus();
      expect(document.activeElement).toBe(inner);
    });

    it('refuses the host when `value` and `valueChange` are not exposed by the same directive', () => {
      expect(() =>
        TestBed.createComponent(hostFor(HalfExposedModel, '<half-exposed-model [formField]="form.field" />')),
      ).toThrow(/NG01914/);
    });
  });

  describe('a conforming control', () => {
    it('passes for a `value` model', async () => {
      await expect(
        assertSignalFormsControl(create(GoodText, '<good-text [formField]="form.field" />')),
      ).resolves.toBeUndefined();
    });

    it('passes for a `checked` model', async () => {
      await expect(
        assertSignalFormsControl(create(GoodToggle, '<good-toggle [formField]="form.field" />', false)),
      ).resolves.toBeUndefined();
    });

    it("passes for a control that is a directive on someone else's element", async () => {
      // The control is not the node's component here, so a check that reached
      // for `componentInstance` would find the host's own view and report
      // nothing wrong with a control it never looked at.
      await expect(
        assertSignalFormsControl(create(GoodAttribute, '<div goodAttribute [formField]="form.field"></div>')),
      ).resolves.toBeUndefined();
    });

    it('passes when `disabled` and `readonly` arrive through a host directive that exposes them', async () => {
      // The case the definition read used to get backwards: the inputs are not
      // on the component's own definition, and Angular writes them anyway.
      await expect(
        assertSignalFormsControl(create(ExposedState, '<exposed-state [formField]="form.field" />')),
      ).resolves.toBeUndefined();
    });

    it('passes when the whole control is a host directive, exposed under aliases', async () => {
      // Its `focus()` is the component's, the only place Angular reads one, and
      // its host takes no focus, so this also holds the focus rule to the
      // control Angular registered rather than to the directive the model is on.
      await expect(
        assertSignalFormsControl(create(ModelFromHost, '<model-from-host [formField]="form.field" />')),
      ).resolves.toBeUndefined();
    });

    it('passes for a component whose host directive carries an unexposed model of its own', async () => {
      // Angular binds the component's model and never sees the directive's, so
      // counting the two as rivals would fail a control Angular binds cleanly.
      await expect(
        assertSignalFormsControl(create(ShadowedModel, '<shadowed-model [formField]="form.field" />')),
      ).resolves.toBeUndefined();
    });

    it('passes when the state is exposed two host directives down, through the function form', async () => {
      await expect(
        assertSignalFormsControl(create(RelayedState, '<relayed-state [formField]="form.field" />')),
      ).resolves.toBeUndefined();
    });

    it('passes when one host directive is reached twice, each path exposing half', async () => {
      await expect(
        assertSignalFormsControl(create(DiamondState, '<diamond-state [formField]="form.field" />')),
      ).resolves.toBeUndefined();
    });

    it('passes when `disabled` and `readonly` are exposed under an alias, through the function form', async () => {
      // The function form carries its exposure as a flat `[own, exposed]` list,
      // so a reader that took each name for itself would look for `isDisabled`
      // on the element and fail a control Angular writes both inputs to.
      await expect(
        assertSignalFormsControl(create(AliasedExposure, '<aliased-exposure [formField]="form.field" />')),
      ).resolves.toBeUndefined();
    });

    it('passes when `touch` comes from a host directive', async () => {
      await expect(
        assertSignalFormsControl(create(TouchFromHost, '<touch-from-host [formField]="form.field" />')),
      ).resolves.toBeUndefined();
    });

    it('marks the field touched, which is the state the touch rule leaves behind', async () => {
      const fixture = TestBed.createComponent(hostFor(GoodText, '<good-text [formField]="form.field" />'));
      await assertSignalFormsControl(fixture);

      const host = fixture.componentInstance as { form: { field: () => { touched: () => boolean } } };
      expect(host.form.field().touched()).toBe(true);
    });

    it('leaves focus on the input inside the control, which is where the focus rule put it', async () => {
      // A pass on its own could be vacuous: a rule that never asked for focus,
      // or read the document before focus arrived, would pass too. Focus on the
      // very element `focus()` forwards to is the trace of a probe that ran.
      const fixture = TestBed.createComponent(hostFor(GoodText, '<good-text [formField]="form.field" />'));
      await assertSignalFormsControl(fixture);

      const root = fixture.nativeElement as HTMLElement;
      expect(document.activeElement).toBe(root.querySelector('good-text input'));
    });
  });

  describe('a broken control fails naming the rule', () => {
    it('value-model — no `valueChange`, so Angular finds no model at all', async () => {
      expect(await ruleBrokenBy(create(NoModel, '<no-model [formField]="form.field" />'))).toBe('value-model');
    });

    it('value-model — the model is there but aliased out of reach', async () => {
      expect(await ruleBrokenBy(create(AliasedModel, '<aliased-model [formField]="form.field" />'))).toBe(
        'value-model',
      );
    });

    it('value-model — `input()` plus `output()` instead of a writable `model()`', async () => {
      expect(await ruleBrokenBy(create(UnwritableModel, '<unwritable-model [formField]="form.field" />'))).toBe(
        'value-model',
      );
    });

    it('value-model — a host directive exposes `value` and not `valueChange`', async () => {
      expect(await ruleBrokenBy(create(HalfExposedModel, '<half-exposed-model [formField]="form.field" />'))).toBe(
        'value-model',
      );
    });

    it('single-model — both `value` and `checked`, one of them dead', async () => {
      expect(await ruleBrokenBy(create(BothModels, '<both-models [formField]="form.field" />'))).toBe('single-model');
    });

    it('single-model — its own `value`, and a `checked` pair a host directive exposes', async () => {
      const error = await errorFrom(
        assertSignalFormsControl(
          create(ValueAndExposedChecked, '<value-and-exposed-checked [formField]="form.field" />'),
        ),
      );

      expect(error.rule).toBe('single-model');
      expect(error.message).toContain('counting what `CheckedState` exposes');
    });

    it('single-model — two directives on one element, each with a model', async () => {
      expect(
        await ruleBrokenBy(
          create(GoodText, '<good-text goodAttribute [formField]="form.field" />', '', [GoodAttribute]),
        ),
      ).toBe('single-model');
    });

    it('no-value-accessor — a leftover accessor silently outranks the model', async () => {
      expect(await ruleBrokenBy(create(WithAccessor, '<with-accessor [formField]="form.field" />'))).toBe(
        'no-value-accessor',
      );
    });

    it('touch-output — named `touched`, which Angular does not subscribe to', async () => {
      expect(await ruleBrokenBy(create(WrongTouchName, '<wrong-touch-name [formField]="form.field" />'))).toBe(
        'touch-output',
      );
    });

    it('disabled-input — a disabled field would reach it and be dropped', async () => {
      expect(await ruleBrokenBy(create(NoDisabled, '<no-disabled [formField]="form.field" />'))).toBe('disabled-input');
    });

    it('readonly-input — the omission with no symptom', async () => {
      expect(await ruleBrokenBy(create(NoReadonly, '<no-readonly [formField]="form.field" />'))).toBe('readonly-input');
    });

    it('disabled-input — declared on a host directive and never exposed', async () => {
      // The other half of the same mistake: the class has every input, so a
      // check reading the directive that DECLARES them passes a control Angular
      // writes neither of them to.
      expect(await ruleBrokenBy(create(HiddenState, '<hidden-state [formField]="form.field" />'))).toBe(
        'disabled-input',
      );
    });

    it('touch-output — declared on a host directive and never exposed', async () => {
      expect(await ruleBrokenBy(create(HiddenTouch, '<hidden-touch [formField]="form.field" />'))).toBe('touch-output');
    });

    it('write-keeps-pristine — null normalised to an empty string by the first render', async () => {
      const error = await errorFrom(
        assertSignalFormsControl(create(NormalisesNull, '<normalises-null [formField]="form.field" />', null)),
      );

      expect(error.rule).toBe('write-keeps-pristine');
      expect(error.message).toContain('has been rendered once');
      expect(error.message).toContain('holding ""');
    });

    it('write-keeps-pristine — a clamp written back by the first render', async () => {
      const error = await errorFrom(
        assertSignalFormsControl(create(ClampsModel, '<clamps-model [formField]="form.field" />', 150)),
      );

      expect(error.rule).toBe('write-keeps-pristine');
      expect(error.message).toContain('holding 100');
    });

    it('write-keeps-pristine — a clamp written back after the form writes an out-of-range value', async () => {
      // Started in range, so the render has nothing to clamp; the probe write
      // is what does it, which is the read a load or a patch would trip.
      const error = await errorFrom(
        assertSignalFormsControl(create(ClampsModel, '<clamps-model [formField]="form.field" />', 50), {
          values: [150, 20],
        }),
      );

      expect(error.rule).toBe('write-keeps-pristine');
      expect(error.message).toContain('The form wrote 150 into the pristine field');
      expect(error.message).toContain('ClampsModel reported 100 back');
      expect(error.message).toContain('the first of `values`');
    });

    it('write-keeps-pristine — the default probe converted on the way in, which `values` is for', async () => {
      // A control that coerces is the one the round trip used to catch here;
      // the coercion is reported back and dirties the field, so the rule
      // before the round trip catches it first, and has to say how to tell a
      // false failure apart.
      const error = await errorFrom(
        assertSignalFormsControl(create(CoercesValue, '<coerces-value [formField]="form.field" />')),
      );

      expect(error.rule).toBe('write-keeps-pristine');
      expect(error.message).toContain('CoercesValue reported "[object Object]" back');
      expect(error.message).toContain("ngtrue's default probe");
      expect(error.message).toContain('outside its range');
    });

    it('value-round-trip — the write never reaches the model it resolved, and nothing comes back', async () => {
      // A drift between the assertion's reading of the definitions and
      // Angular's, simulated after Angular has bound: ShadowedModel loses its
      // own `valueChange` and gains an exposure of WholeControl's pair, so the
      // assertion resolves WholeControl's model while Angular goes on writing
      // ShadowedModel's. The form's write lands in ShadowedModel, which keeps
      // it as written, so nothing comes back and the field stays pristine; the
      // model read here never sees the write, and the round trip, judged on
      // that same write, is what says so.
      const fixture = await rendered(hostFor(ShadowedModel, '<shadowed-model [formField]="form.field" />'));
      const definition = (ShadowedModel as unknown as { ɵcmp: Record<string, unknown> }).ɵcmp;
      const { outputs, hostDirectives } = definition;
      try {
        definition['outputs'] = { touch: 'touch' };
        definition['hostDirectives'] = [
          { directive: WholeControl, inputs: { value: 'value' }, outputs: { valueChange: 'valueChange' } },
        ];
        const error = await errorFrom(assertSignalFormsControl(fixture));

        expect(error.rule).toBe('value-round-trip');
        expect(error.message).toContain('the field is still pristine');
      } finally {
        definition['outputs'] = outputs;
        definition['hostDirectives'] = hostDirectives;
      }
    });

    it('value-round-trip — the value does not survive the trip out', async () => {
      // A string in, which it keeps; an object out, which it turns into a
      // string after the field has already taken the object. Same rule, the
      // other half of it, so the message is what tells the two apart.
      const error = await errorFrom(
        assertSignalFormsControl(create(CoercesValue, '<coerces-value [formField]="form.field" />'), {
          values: ['first', { not: 'a string' }],
        }),
      );

      expect(error.rule).toBe('value-round-trip');
      expect(error.message).toContain('CoercesValue set `value` to {"not":"a string"}');
    });

    it('touch-marks-touched — the template applies the host directive by hand, and Angular drops its exposure', async () => {
      // Nothing in any definition says so: the control declares the exposure,
      // and Angular discards it because the template matched the directive
      // itself. The definition rules pass this; only emitting `touch` and
      // watching the field catches it.
      const error = await errorFrom(
        assertSignalFormsControl(
          create(TouchFromHost, '<touch-from-host touchSource [formField]="form.field" />', '', [TouchSource]),
        ),
      );

      expect(error.rule).toBe('touch-marks-touched');
      expect(error.message).toContain('emitted `touch`');
    });

    it('focus-reaches-control — a `focus()` declared only on a host directive, which Angular never calls', async () => {
      const error = await errorFrom(
        assertSignalFormsControl(create(FocusFromHost, '<focus-from-host [formField]="form.field" />')),
      );

      expect(error.rule).toBe('focus-reaches-control');
      expect(error.message).toContain('declares no `focus()`');
      expect(error.message).toContain('`FocusForwarder`, a host directive of FocusFromHost');
    });

    it('focus-reaches-control — no `focus()`, and a host that cannot take focus', async () => {
      const error = await errorFrom(assertSignalFormsControl(create(NoFocus, '<no-focus [formField]="form.field" />')));

      expect(error.rule).toBe('focus-reaches-control');
      expect(error.message).toContain('declares no `focus()`');
      expect(error.message).toContain('focus is on <body>');
    });

    it('focus-reaches-control — a `focus()` that throws', async () => {
      // The rule id alone cannot tell this apart from the case above: an error
      // swallowed on the way would fail the same rule, one step later, for a
      // reason that is not this one. The thrown error has to be in the report.
      const error = await errorFrom(
        assertSignalFormsControl(create(FocusThrows, '<focus-throws [formField]="form.field" />')),
      );

      expect(error.rule).toBe('focus-reaches-control');
      expect(error.message).toContain('threw');
      expect(error.message).toContain('NG0951');
    });

    it('focus-reaches-control — a `focus()` that moves focus out of the control', async () => {
      // Focus leaves <body> here, so this is the case that holds the rule to
      // "inside the host" rather than to "somewhere other than where it was".
      const error = await errorFrom(
        assertSignalFormsControl(create(FocusEscapes, '<focus-escapes [formField]="form.field" />')),
      );

      expect(error.rule).toBe('focus-reaches-control');
      expect(error.message).toContain('focus is on <input>');
      expect(error.message).toContain('declares `focus` and Angular called it');
    });
  });

  describe('the message', () => {
    it('names the rule, the element and the class', async () => {
      const error = await errorFrom(
        assertSignalFormsControl(create(NoReadonly, '<no-readonly [formField]="form.field" />')),
      );

      expect(error.message).toContain('rule: readonly-input');
      expect(error.message).toContain('<no-readonly>');
      expect(error.message).toContain('NoReadonly');
    });

    it('lists what the control did declare, so the missing name is obvious beside them', async () => {
      const error = await errorFrom(
        assertSignalFormsControl(create(NoDisabled, '<no-disabled [formField]="form.field" />')),
      );

      expect(error.message).toContain('`readonly`');
      expect(error.message).not.toContain('Inputs seen: none');
    });

    it('names the host directive that declares an input it never exposed', async () => {
      const error = await errorFrom(
        assertSignalFormsControl(create(HiddenState, '<hidden-state [formField]="form.field" />')),
      );

      expect(error.message).toContain('<hidden-state> (HiddenState)');
      expect(error.message).toContain('WholeControl');
      expect(error.message).toContain('not exposed');
    });

    it('quotes Angular when Angular is the one that refused the host', async () => {
      const error = await errorFrom(assertSignalFormsControl(create(NoModel, '<no-model [formField]="form.field" />')));

      expect(error.rule).toBe('value-model');
      expect(error.message).toContain('NG01914');
    });
  });

  describe('a fixture that cannot answer the pristine rule', () => {
    // Signal Forms reads `dirty` as false on a hidden, disabled or read-only
    // field, whatever the control writes back, so a pass there would vouch for
    // a control that clamps into its model as readily as for one that does
    // not. One state at a time, because each is its own way in and a refusal
    // that knew only two of them would pass anything on the third.
    it.each<readonly [string, FieldRule]>([
      ['hidden', field => hidden(field)],
      ['disabled', field => disabled(field)],
      ['readonly', field => readonly(field)],
    ])('is refused when the field is %s, where nothing can make it dirty', async (state, rule) => {
      const error = await errorFrom(
        assertSignalFormsControl(() =>
          TestBed.createComponent(stateHost(GoodText, '<good-text [formField]="form.field" />', [], rule)),
        ),
      );
      expect(error.rule).toBe('write-keeps-pristine');
      expect(error.message).toContain(`The bound field is ${state}, so it cannot be dirty`);
    });

    it('is refused when the value the form writes makes the field read-only', async () => {
      // Interactive while it renders, read-only for the probe value: the
      // refusal has to come after the write as well as before it.
      const lockedByValue: FieldRule = field => readonly(field, ({ value }) => value() === 'locked');
      const error = await errorFrom(
        assertSignalFormsControl(
          () =>
            TestBed.createComponent(stateHost(GoodText, '<good-text [formField]="form.field" />', [], lockedByValue)),
          { values: ['locked', 'open'] },
        ),
      );
      expect(error.rule).toBe('write-keeps-pristine');
      expect(error.message).toContain('The bound field is readonly once the form has written "locked" into it');
    });

    it("reports a field the test dirtied itself against the control, and says that it might be the test's", async () => {
      // The contract: a fixture handed to the assertion is fresh, so nothing
      // but the control has written to it. Telling a test's own write apart
      // from a control's is not possible from the field, so the message names
      // both.
      const fixture = TestBed.createComponent(hostFor(GoodText, '<good-text [formField]="form.field" />'));
      fieldOf(fixture).controlValue.set('typed by the test');

      const error = await errorFrom(assertSignalFormsControl(fixture));
      expect(error.rule).toBe('write-keeps-pristine');
      expect(error.message).toContain('a test that wrote to the field before handing the fixture over');
    });
  });

  describe('a fixture that cannot answer the touch rule', () => {
    it('is refused when the field is already touched', async () => {
      const fixture = TestBed.createComponent(hostFor(GoodText, '<good-text [formField]="form.field" />'));
      fieldOf(fixture).markAsTouched();

      const error = await errorFrom(assertSignalFormsControl(fixture));
      expect(error.rule).toBe('touch-marks-touched');
      expect(error.message).toContain('already touched');
    });

    it('is refused when the value the round trip leaves makes the field read-only', async () => {
      // Signal Forms reads `touched` as false on a hidden, disabled or
      // read-only field, whatever the control emits, so reporting that as a
      // control that is not wired would blame the control for the fixture's
      // schema. The pristine rule refuses such a field before anything is
      // written; this one is interactive until the round trip's second value
      // turns it read-only, which only the touch rule is left to see.
      const lockedByValue: FieldRule = field => readonly(field, ({ value }) => value() === 'locked');
      const error = await errorFrom(
        assertSignalFormsControl(
          () =>
            TestBed.createComponent(stateHost(GoodText, '<good-text [formField]="form.field" />', [], lockedByValue)),
          { values: ['open', 'locked'] },
        ),
      );
      expect(error.rule).toBe('touch-marks-touched');
      expect(error.message).toContain('The bound field is readonly, so it cannot be touched');
    });
  });

  describe('the pristine rule', () => {
    it('passes a plain model whose field starts at null', async () => {
      await expect(
        assertSignalFormsControl(create(GoodText, '<good-text [formField]="form.field" />', null)),
      ).resolves.toBeUndefined();
    });

    it('passes a control that clamps only what it shows, started out of range', async () => {
      // The sound twin of ClampsModel, held to the same start: the render
      // hands it 150 and the field still holds 150 afterwards.
      await expect(
        assertSignalFormsControl(create(ClampsShown, '<clamps-shown [formField]="form.field" />', 150)),
      ).resolves.toBeUndefined();
    });

    it('passes the same control when the out-of-range value is the one the form writes', async () => {
      await expect(
        assertSignalFormsControl(create(ClampsShown, '<clamps-shown [formField]="form.field" />', 50), {
          values: [150, 20],
        }),
      ).resolves.toBeUndefined();
    });

    it('misses a clamp written back when nothing it writes is out of range', async () => {
      // The limit the JSDoc names, pinned so the sentence goes when it stops
      // being true: an in-range start and the default probes, an anonymous
      // object ClampsModel's comparison leaves alone, give it nothing to clamp.
      await expect(
        assertSignalFormsControl(create(ClampsModel, '<clamps-model [formField]="form.field" />', 50)),
      ).resolves.toBeUndefined();
    });
  });

  describe('a composition it cannot read', () => {
    // Angular's private layout moving under the walk, simulated on a fixture
    // that has already rendered: Angular resolved the real definition, so only
    // the assertion sees the change. Each case uses HiddenState because there
    // the wrong reading is a PASS — with no host directives read, WholeControl
    // counts as a directive the template matched, carries every member itself,
    // and becomes the control. Refusing is the only answer that is not a lie.
    class NotADirective {}

    async function failureAfter(patch: (definition: Record<string, unknown>) => void): Promise<unknown> {
      const fixture = await rendered(hostFor(HiddenState, '<hidden-state [formField]="form.field" />'));
      const definition = (HiddenState as unknown as { ɵcmp: Record<string, unknown> }).ɵcmp;
      const original = definition['hostDirectives'];
      try {
        patch(definition);
        return await assertSignalFormsControl(fixture).then(
          () => new Error('expected assertSignalFormsControl to refuse, and it passed.'),
          (error: unknown) => error,
        );
      } finally {
        definition['hostDirectives'] = original;
      }
    }

    it('refuses a definition that has no `hostDirectives` field at all', async () => {
      const error = await failureAfter(definition => {
        delete definition['hostDirectives'];
      });

      expect(error).not.toBeInstanceOf(SignalFormsControlError);
      expect((error as Error).message).toContain('found a definition with no `hostDirectives` field');
    });

    it('refuses an entry that names no directive', async () => {
      const error = await failureAfter(definition => {
        definition['hostDirectives'] = [{ directive: NotADirective, inputs: {}, outputs: {} }];
      });

      expect(error).not.toBeInstanceOf(SignalFormsControlError);
      expect((error as Error).message).toContain('found a `hostDirectives` entry that names no directive');
    });
  });

  describe('the focus rule', () => {
    it('waits for a `focus()` that finishes after the next render', async () => {
      // The sound twin of FocusThrows. Its input does not exist until edit
      // mode has rendered, so focus lands a render after the call — and a rule
      // that read the document without flushing first would fail it.
      await expect(
        assertSignalFormsControl(create(FocusAfterRender, '<focus-after-render [formField]="form.field" />')),
      ).resolves.toBeUndefined();
    });

    it('moves focus out first, so a control focused before the assertion is still judged', async () => {
      // Without the blur, focus would start inside and the starting-point check
      // would refuse a sound control. With it, the probe starts from nowhere
      // and the control has to bring focus back by itself.
      const fixture = TestBed.createComponent(hostFor(GoodText, '<good-text [formField]="form.field" />'));
      await fixture.whenStable();
      const inner = (fixture.nativeElement as HTMLElement).querySelector('input') as HTMLInputElement;
      inner.focus();
      expect(document.activeElement).toBe(inner);

      await expect(assertSignalFormsControl(fixture)).resolves.toBeUndefined();
    });
  });

  describe('the focus rule refuses to answer what it cannot see', () => {
    it('when focus is already inside the control and will not leave', async () => {
      // HoldsFocus has no `focus()` and no tab stop on its host, so asking the
      // field to focus it does nothing — and it would PASS, because focus is
      // already where the rule looks for it. Only the starting-point check
      // stands between this control and a green run.
      const error = await errorFrom(
        assertSignalFormsControl(create(HoldsFocus, '<holds-focus [formField]="form.field" />')),
      );

      expect(error.rule).toBe('focus-reaches-control');
      expect(error.message).toContain('already inside HoldsFocus');
    });

    it('when the fixture is not attached to the document', async () => {
      // A sound control. Detached, nothing in it can take focus, and the
      // failure has to say the fixture is why rather than blame the control.
      const fixture = TestBed.createComponent(hostFor(GoodText, '<good-text [formField]="form.field" />'));
      (fixture.nativeElement as HTMLElement).remove();

      const error = await errorFrom(assertSignalFormsControl(fixture));

      expect(error.rule).toBe('focus-reaches-control');
      expect(error.message).toContain('not attached to a document');
    });
  });

  describe('`values`', () => {
    it('lets a control that normalises on purpose pass', async () => {
      // The same control that fails above. The default probes are anonymous
      // objects and it coerces them to strings; given two strings it round
      // trips, which is the difference between a control that alters its value
      // and one whose binding is not connected.
      await expect(
        assertSignalFormsControl(create(CoercesValue, '<coerces-value [formField]="form.field" />'), {
          values: ['first', 'second'],
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('finding the control', () => {
    it('refuses a fixture that binds nothing', async () => {
      @Component({ template: '<good-text />', imports: [GoodText] })
      class Unbound {}

      await expect(assertSignalFormsControl(TestBed.createComponent(Unbound))).rejects.toThrow(/carries \[formField\]/);
    });

    it('refuses to guess between two bound controls', async () => {
      @Component({
        template: '<good-text [formField]="form.a" /><good-text [formField]="form.b" />',
        imports: [GoodText, FormField],
      })
      class Two {
        readonly model = signal({ a: '', b: '' });
        readonly form = form(this.model);
      }

      await expect(assertSignalFormsControl(TestBed.createComponent(Two))).rejects.toThrow(/binds 2 controls/);
    });

    it('checks the one a selector picks out', async () => {
      @Component({
        template: '<good-text [formField]="form.a" /><no-readonly id="second" [formField]="form.b" />',
        imports: [GoodText, NoReadonly, FormField],
      })
      class Mixed {
        readonly model = signal({ a: '', b: '' });
        readonly form = form(this.model);
      }

      const fixture = TestBed.createComponent(Mixed);
      await expect(assertSignalFormsControl(fixture, { selector: 'good-text' })).resolves.toBeUndefined();

      const second = TestBed.createComponent(Mixed);
      await expect(assertSignalFormsControl(second, { selector: '#second' })).rejects.toThrow(/rule: readonly-input/);
    });
  });
});
