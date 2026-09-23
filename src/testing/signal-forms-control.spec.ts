import { Component, provideZonelessChangeDetection, signal, type Type } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { FormField, form } from '@angular/forms/signals';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  GoodAttribute,
  GoodText,
  GoodToggle,
  AliasedModel,
  BothModels,
  CoercesValue,
  NoDisabled,
  NoModel,
  NoReadonly,
  UnwritableModel,
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
function hostFor(control: Type<unknown>, template: string, initial: unknown = ''): Type<unknown> {
  @Component({ template, imports: [control, FormField] })
  class Host {
    readonly model = signal({ field: initial });
    readonly form = form(this.model);
  }
  return Host;
}

/** The factory form, which is how the assertion is meant to be called. */
function create(control: Type<unknown>, template: string, initial: unknown = ''): () => ComponentFixture<unknown> {
  return () => TestBed.createComponent(hostFor(control, template, initial));
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

    it('marks the field touched, which is the state the last rule leaves behind', async () => {
      const fixture = TestBed.createComponent(hostFor(GoodText, '<good-text [formField]="form.field" />'));
      await assertSignalFormsControl(fixture);

      const host = fixture.componentInstance as { form: { field: () => { touched: () => boolean } } };
      expect(host.form.field().touched()).toBe(true);
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

    it('single-model — both `value` and `checked`, one of them dead', async () => {
      expect(await ruleBrokenBy(create(BothModels, '<both-models [formField]="form.field" />'))).toBe('single-model');
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

    it('value-round-trip — the value does not survive the trip', async () => {
      expect(await ruleBrokenBy(create(CoercesValue, '<coerces-value [formField]="form.field" />'))).toBe(
        'value-round-trip',
      );
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

    it('quotes Angular when Angular is the one that refused the host', async () => {
      const error = await errorFrom(assertSignalFormsControl(create(NoModel, '<no-model [formField]="form.field" />')));

      expect(error.rule).toBe('value-model');
      expect(error.message).toContain('NG01914');
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
