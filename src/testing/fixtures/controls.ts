/**
 * Controls for the conformance suite's own tests: ones that are right, and ones
 * wrong in exactly one way each.
 *
 * Every broken control here is a shape someone actually writes. None of them is
 * a syntax error or a type error, because a conformance suite earns nothing by
 * catching what the compiler already catches — the point of each is that it
 * compiles, renders, and is quietly not a control.
 *
 * These are compiled by the test run and never by `tsc -p tsconfig.build.json`:
 * they are the only components in the repository, and they exist so the suite
 * can be pointed at something.
 */
import { Component, Directive, effect, forwardRef, input, model, output } from '@angular/core';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import type { FormCheckboxControl, FormValueControl } from '@angular/forms/signals';

/** A control that satisfies every rule. */
@Component({ selector: 'good-text', template: '<span>{{ value() }}</span>' })
export class GoodText implements FormValueControl<unknown> {
  readonly value = model<unknown>('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly touch = output<void>();
}

/** The checkbox half of the contract, which takes the other model name. */
@Component({ selector: 'good-toggle', template: '<span>{{ checked() }}</span>' })
export class GoodToggle implements FormCheckboxControl {
  readonly checked = model(false);
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly touch = output<void>();
}

/**
 * A control on someone else's element rather than on a tag of its own, so the
 * suite is held to finding a control that is not the node's component.
 */
@Directive({ selector: '[goodAttribute]' })
export class GoodAttribute implements FormValueControl<unknown> {
  readonly value = model<unknown>('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly touch = output<void>();
}

/**
 * A conforming control that coerces whatever it is given to a string.
 *
 * Every numeric, date and masked control in a real library does some version of
 * this, and it is the one shape the round trip cannot tell apart from a broken
 * binding on its own — which is what `values` is for.
 */
@Component({ selector: 'coerces-value', template: '<span>{{ value() }}</span>' })
export class CoercesValue implements FormValueControl<string> {
  readonly value = model('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly touch = output<void>();

  constructor() {
    effect(() => {
      const incoming: unknown = this.value();
      if (typeof incoming !== 'string') this.value.set(String(incoming));
    });
  }
}

/**
 * A control whose value is a plain input. It renders, it accepts a value, and
 * `[formField]` refuses it: with no `valueChange` output there is no model for
 * Angular to find, which is the one failure the framework reports loudly.
 */
@Component({ selector: 'no-model', template: '<span>{{ value() }}</span>' })
export class NoModel {
  readonly value = input<unknown>('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly touch = output<void>();
}

/**
 * A model under an alias. The class says `value`, the binding name is `val`, and
 * Angular — which matches the public name — sees no model at all.
 */
@Component({ selector: 'aliased-model', template: '<span>{{ value() }}</span>' })
export class AliasedModel {
  readonly value = model<unknown>('', { alias: 'val' });
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly touch = output<void>();
}

/**
 * `input()` plus `output()` standing in for `model()`: the shape that reads like
 * a model at the call site and cannot be written by the component that owns it.
 */
@Component({ selector: 'unwritable-model', template: '<span>{{ value() }}</span>' })
export class UnwritableModel {
  readonly value = input<unknown>('');
  readonly valueChange = output<unknown>();
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly touch = output<void>();
}

/** Both models at once — `checked` binds to nothing and looks live. */
@Component({ selector: 'both-models', template: '<span>{{ value() }}</span>' })
export class BothModels {
  readonly value = model<unknown>('');
  readonly checked = model(false);
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly touch = output<void>();
}

/** A model and a leftover accessor. The accessor wins and the model goes dark. */
@Component({
  selector: 'with-accessor',
  template: '<span>{{ value() }}</span>',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => WithAccessor), multi: true }],
})
export class WithAccessor implements ControlValueAccessor {
  readonly value = model<unknown>('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly touch = output<void>();

  writeValue(value: unknown): void {
    this.value.set(value);
  }
  registerOnChange(): void {
    // The accessor exists to be found, not to be driven.
  }
  registerOnTouched(): void {
    // Same.
  }
}

/**
 * `touched` instead of `touch`. Reads fine, subscribes to nothing.
 *
 * It cannot claim `FormValueControl`, and that is part of the lesson rather
 * than a fixture compromise: `touched` is already a binding name in the
 * contract — an optional INPUT carrying the field's touched state — so this
 * control does not merely miss the output Angular listens for, it declares
 * something else under a name Angular writes TO.
 */
@Component({ selector: 'wrong-touch-name', template: '<span>{{ value() }}</span>' })
export class WrongTouchName {
  readonly value = model<unknown>('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly touched = output<void>();
}

/** No `disabled` input: a disabled field reaches it and is dropped. */
@Component({ selector: 'no-disabled', template: '<span>{{ value() }}</span>' })
export class NoDisabled implements FormValueControl<unknown> {
  readonly value = model<unknown>('');
  readonly readonly = input(false);
  readonly touch = output<void>();
}

/** No `readonly` input — the omission with no symptom. */
@Component({ selector: 'no-readonly', template: '<span>{{ value() }}</span>' })
export class NoReadonly implements FormValueControl<unknown> {
  readonly value = model<unknown>('');
  readonly disabled = input(false);
  readonly touch = output<void>();
}
