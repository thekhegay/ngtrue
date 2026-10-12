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
import { Component, Directive, effect, forwardRef, inject, input, model, output } from '@angular/core';
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

// Controls assembled from host directives.
//
// Angular has resolved a custom control through `hostDirectives` since core 22
// (angular/angular#67329): the HOST is the control, and what it binds is the
// host's own members plus whatever its host directives EXPOSE. A member a host
// directive declares and does not expose is never written and never listened
// to, however plainly it sits in that directive's class.

/** The state half of a control, written once and composed into each control. */
@Directive()
export class ControlState {
  readonly disabled = input(false);
  readonly readonly = input(false);
}

/** A control whose `disabled` and `readonly` arrive through a host directive that exposes them. */
@Component({
  selector: 'exposed-state',
  template: '<span>{{ value() }}</span>',
  hostDirectives: [{ directive: ControlState, inputs: ['disabled', 'readonly'] }],
})
export class ExposedState implements FormValueControl<unknown> {
  readonly value = model<unknown>('');
  readonly touch = output<void>();
}

/**
 * A shared behaviour with a vocabulary of its own, exposed under the names the
 * contract uses — so the model Angular binds is `ScoreState.score`, a class
 * property called neither `value` nor anything on the component.
 */
@Directive()
export class ScoreState {
  readonly score = model<unknown>(0);
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly blurred = output<void>();
}

/** The whole control in a host directive, every name exposed, some of them under an alias. */
@Component({
  selector: 'model-from-host',
  template: '<span>{{ state.score() }}</span>',
  hostDirectives: [
    {
      directive: ScoreState,
      inputs: ['score: value', 'disabled', 'readonly'],
      outputs: ['scoreChange: valueChange', 'blurred: touch'],
    },
  ],
})
export class ModelFromHost {
  readonly state = inject(ScoreState);
}

/**
 * A complete control, as a directive. Composed below three ways, each exposing
 * a different part of it.
 */
@Directive()
export class WholeControl {
  readonly value = model<unknown>('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly touch = output<void>();
}

/**
 * A control composing a behaviour directive that has a `value` model of its own
 * — the way a listbox behaviour carries its active option — without exposing
 * it. Angular binds the component's model and never looks at the directive's,
 * so there is one model here, not two.
 */
@Component({
  selector: 'shadowed-model',
  template: '<span>{{ value() }}</span>',
  hostDirectives: [WholeControl],
})
export class ShadowedModel implements FormValueControl<unknown> {
  readonly value = model<unknown>('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly touch = output<void>();
}

/**
 * `disabled` and `readonly` declared on the host directive and left out of the
 * exposure list. The class reads complete; Angular writes neither.
 */
@Component({
  selector: 'hidden-state',
  template: '<span></span>',
  hostDirectives: [{ directive: WholeControl, inputs: ['value'], outputs: ['valueChange', 'touch'] }],
})
export class HiddenState {}

/** The same, with `touch` the one left out. Angular never subscribes to it. */
@Component({
  selector: 'hidden-touch',
  template: '<span></span>',
  hostDirectives: [{ directive: WholeControl, inputs: ['value', 'disabled', 'readonly'], outputs: ['valueChange'] }],
})
export class HiddenTouch {}

/**
 * `value` exposed and `valueChange` forgotten. Angular needs both from the SAME
 * host directive, finds a pair nowhere, and refuses the host.
 */
@Component({
  selector: 'half-exposed-model',
  template: '<span></span>',
  hostDirectives: [{ directive: WholeControl, inputs: ['value', 'disabled', 'readonly'], outputs: ['touch'] }],
})
export class HalfExposedModel {}

/**
 * State two levels down, through a relay named with `forwardRef` — which makes
 * the compiler emit the function form of `hostDirectives`, and puts a bare type
 * in it. A nested host directive's exposure goes straight to the element, so
 * the relay does not have to re-expose anything.
 */
@Component({
  selector: 'relayed-state',
  template: '<span>{{ value() }}</span>',
  hostDirectives: [forwardRef(() => StateRelay)],
})
export class RelayedState implements FormValueControl<unknown> {
  readonly value = model<unknown>('');
  readonly touch = output<void>();
}

@Directive({ hostDirectives: [{ directive: ControlState, inputs: ['disabled', 'readonly'] }] })
export class StateRelay {}

/** A behaviour that composes the state directive for itself, exposing only `readonly`. */
@Directive({ hostDirectives: [{ directive: ControlState, inputs: ['readonly'] }] })
export class ReadonlyBehaviour {}

/**
 * The state directive reached twice — directly, and through a behaviour that
 * composes it as well. Angular merges the two entries into one directive with
 * both exposures, so `disabled` from one path and `readonly` from the other
 * both land.
 *
 * `forwardRef` for a reason other than declaration order. Without it the
 * entries are objects stored on the definition, and Angular's merge WRITES the
 * second exposure into the first entry while it renders — so a reader that
 * comes later finds the union already made and never needs to merge. The
 * function form builds fresh entries on every call, nothing is written back,
 * and a reader has to merge for itself.
 */
@Component({
  selector: 'diamond-state',
  template: '<span>{{ value() }}</span>',
  hostDirectives: [
    { directive: forwardRef(() => ControlState), inputs: ['disabled'] },
    forwardRef(() => ReadonlyBehaviour),
  ],
})
export class DiamondState implements FormValueControl<unknown> {
  readonly value = model<unknown>('');
  readonly touch = output<void>();
}

/**
 * A behaviour composing the state directive and exposing `readonly` only, kept
 * apart from {@link ReadonlyBehaviour} because the spec that uses it changes
 * its definition for the rest of the run — see {@link WidensShared}.
 */
@Directive({ hostDirectives: [{ directive: ControlState, inputs: ['readonly'] }] })
export class SharedBehaviour {}

/** A control on {@link SharedBehaviour} that declares no `disabled` and exposes none. */
@Component({
  selector: 'uses-shared',
  template: '<span>{{ value() }}</span>',
  hostDirectives: [SharedBehaviour],
})
export class UsesShared implements FormValueControl<unknown> {
  readonly value = model<unknown>('');
  readonly touch = output<void>();
}

/**
 * A component reaching the state directive through {@link SharedBehaviour} and
 * again directly, with `disabled`. Angular merges the second exposure into the
 * first entry it met — the one stored on `SharedBehaviour` — so once this has
 * rendered, every component composing `SharedBehaviour` exposes `disabled`.
 */
@Component({
  selector: 'widens-shared',
  template: '',
  hostDirectives: [SharedBehaviour, { directive: ControlState, inputs: ['disabled'] }],
})
export class WidensShared {}

/**
 * A directive a template can also apply by hand. When it does, Angular treats
 * it as the template's directive and drops the exposure the control declared.
 */
@Directive({ selector: '[touchSource]' })
export class TouchSource {
  readonly touch = output<void>();
}

/** A conforming control whose `touch` comes from {@link TouchSource}. */
@Component({
  selector: 'touch-from-host',
  template: '<span>{{ value() }}</span>',
  hostDirectives: [{ directive: TouchSource, outputs: ['touch'] }],
})
export class TouchFromHost implements FormValueControl<unknown> {
  readonly value = model<unknown>('');
  readonly disabled = input(false);
  readonly readonly = input(false);
}

/**
 * State with a vocabulary of its own, and a selector, so a template can apply
 * it by hand as well as a control composing it.
 */
@Directive({ selector: '[aliasedState]' })
export class AliasedState {
  readonly isDisabled = input(false);
  readonly isReadonly = input(false);
}

/**
 * A conforming control whose `disabled` and `readonly` are
 * {@link AliasedState}'s, exposed under the contract's names. `forwardRef` so
 * the alias travels through the function form of `hostDirectives`, whose
 * exposure is a flat `[own, exposed, …]` list rather than a map.
 *
 * Applied by hand as well — `<aliased-exposure aliasedState>` — it is the one
 * case the check cannot see: Angular drops the exposure with the entry, the
 * directive the template matched publishes only `isDisabled` and `isReadonly`,
 * and nothing writes either.
 */
@Component({
  selector: 'aliased-exposure',
  template: '<span>{{ value() }}</span>',
  hostDirectives: [
    { directive: forwardRef(() => AliasedState), inputs: ['isDisabled: disabled', 'isReadonly: readonly'] },
  ],
})
export class AliasedExposure implements FormValueControl<unknown> {
  readonly value = model<unknown>('');
  readonly touch = output<void>();
}

/** A checkbox model as a behaviour of its own. */
@Directive()
export class CheckedState {
  readonly checked = model(false);
}

/**
 * A complete `value` control that also exposes a host directive's `checked`
 * pair. Angular binds the component's own pair before any exposed one, so the
 * `checked` model is never written and never read — the dead input of
 * {@link BothModels}, arriving from a host directive instead.
 */
@Component({
  selector: 'value-and-exposed-checked',
  template: '<span>{{ value() }}</span>',
  hostDirectives: [{ directive: CheckedState, inputs: ['checked'], outputs: ['checkedChange'] }],
})
export class ValueAndExposedChecked {
  readonly value = model<unknown>('');
  readonly disabled = input(false);
  readonly readonly = input(false);
  readonly touch = output<void>();
}
