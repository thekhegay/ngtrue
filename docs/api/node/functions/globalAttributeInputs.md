[ngtrue](../../index.md) / [node](../index.md) / globalAttributeInputs

# Function: globalAttributeInputs()

> **globalAttributeInputs**(`options`): `Promise`\<readonly `string`[]\>

Defined in: [src/node/global-attribute-inputs.ts:272](https://github.com/thekhegay/ngtrue/blob/main/src/node/global-attribute-inputs.ts#L272)

Every input whose public name is an HTML global attribute with a visible
effect, on a component whose host has no binding for that attribute — as one
sentence each. An empty array is a pass.

```ts
it('keeps a static title off the host', async () => {
  expect(await globalAttributeInputs({ packageDir: 'dist' })).toEqual([]);
});
```

## The question

A template that writes an attribute STATICALLY — `<wr-result-404 title="Lost?">`
— sets the input of that name and also leaves the attribute on the element.
Angular has always done both, and for most names the second half is
invisible. For `title` it is the browser's own tooltip hovering over the
whole component; for `id` it is a `<label for>` that lands on the host rather
than on the input inside it; for `hidden` or `popover` it is a component that
vanishes. The compiler accepts it, the input receives its value, and nothing
says a word until somebody hovers. A bound `[title]="…"` sets only the input,
which is why the defect survives a test suite that binds everything.

The fix is one host binding, `'[attr.title]': 'null'`. It runs after the
static attribute is written, and binding `null` removes it.

The question is old and keeps being asked. It has been open against Angular
since 2018 ([angular/angular#24376](https://github.com/angular/angular/issues/24376)),
and angular-eslint was asked for an input twin of `no-output-native` that was
never built ([angular-eslint/angular-eslint#320](https://github.com/angular-eslint/angular-eslint/issues/320)).
It reaches real libraries: candor shipped the tooltip on four components
([pawn002/candor#78](https://github.com/pawn002/candor/issues/78)), and ngwr
moved `id` off three control hosts as a breaking change
([98629b82](https://github.com/thekhegay/ngwr/commit/98629b82ac19ff17bd90e57c47a3824ef64cb340))
and then `title` off ten more
([6fa38c20](https://github.com/thekhegay/ngwr/commit/6fa38c20a4fac8dd6be6d3868b2fbc2839d470b8)) —
a sweep by hand that missed the three result presets, which this finds.

## How it reads the package

From the partial declarations — the `ɵɵngDeclareComponent` and
`ɵɵngDeclareDirective` calls every published Angular library carries — read
with the TypeScript parser, starting from each JavaScript file `exports`
reaches and following relative imports from there. A component's input
surface is merged the way Angular merges it at runtime:

- its own inputs and host bindings;
- the inputs its `hostDirectives` EXPOSE, under the alias the host gives them;
  the inputs THOSE directives expose from host directives of their own, which
  Angular applies to the same element under the names the middle declaration
  gives them, at any depth; and every host binding along the way;
- everything a base class contributes — inputs, host bindings, host
  directives — followed through its own `extends` in turn, across files,
  entry points and packages.

A base class or a host directive from another package is read from that
package as installed: found in the `node_modules` directories above the
package, the way Node resolves the import — from the real path, so a pnpm
store is searched where Node searches it — and read the same way as this
one. Material's components extend CDK classes that bring inputs and host
bindings of their own, and ngwr's sortable item carries `CdkDrag`; neither is
answerable without reading `@angular/cdk`. A finding that runs through such a
class names the package and the version that was read.

A base TypeScript holds in a local is followed through it. A class with a
member that carries a standard (TC39) decorator is emitted inside a function,
as `let _classSuper = NzTreeBase; … return class … extends _classSuper` —
ng-zorro-antd builds that way — and the name is looked up in the blocks
around the class before the module scope, as the engine looks it up.

Names are compared lowercased. An input called `tabIndex`, written statically
as `tabIndex="0"`, sets the input and lands on the element as `tabindex`,
because HTML attribute names are case-insensitive.

Only a property binding counts as the fix — `[attr.title]`, or the DOM
property `[title]`. A STATIC host attribute does not: `host: { title: '' }`
loses to the same attribute written in a template, since Angular merges the
template's attributes last.

## Which attributes, and why these

The list is chosen by what the attribute does to an element the consumer
never meant to give it, not copied from the spec's list of global attributes:

| Attribute | On the host, it… |
| --- | --- |
| `title` | draws a native tooltip over the whole component |
| `id` | gives the HOST the id, so `<label for>`, fragment links and `getElementById` find the wrong element — and two share it when the component forwards it |
| `hidden` | hides the host through the user-agent `[hidden]` rule, unless a host style sets `display` |
| `lang` | re-languages the subtree: hyphenation, quotes, font fallback, screen-reader voice |
| `dir` | flips the direction, and the layout, of the subtree |
| `tabindex` | makes the host focusable — an extra tab stop or click target |
| `accesskey` | binds the shortcut to the host, in front of the inner control |
| `draggable` | makes the host a native drag source (for `"true"`) |
| `spellcheck` | reaches every editable element inside, by inheritance |
| `contenteditable` | makes the whole host editable |
| `inert` | disables the host and hides it from assistive technology |
| `popover` | turns the host into a popover, hidden until shown |
| `role` | changes what assistive technology announces the host as |

`role` is ARIA rather than HTML, and HTML allows it on every element; it is
here because its effect is exactly this class of defect, heard rather than
seen.

Left out, each for a reason:

- `autofocus` — honoured only on a focusable element, and a host is not one
  unless something gives it a `tabindex`, which this list covers. ngwr carries
  four `autoFocus` inputs; flagging them would be noise.
- `class` and `style` — Angular merges both into the host on purpose; they are
  how a consumer styles a host, and an invalid `style` value is dropped by
  the browser.
- `translate` — changes nothing until a translation tool runs, and then only
  for `"no"`.
- `autocapitalize`, `autocorrect`, `enterkeyhint`, `inputmode` and
  `writingsuggestions` — they steer the keyboard or the suggestions of an
  editable element, and a host is not editable unless `contenteditable` makes
  it so, which is on the list.
- `slot`, `part` and `exportparts` — they matter only around a shadow root.
- `is`, `nonce`, the microdata attributes and `data-*` — no effect on how the
  element renders or behaves.
- `aria-*` — what each does depends on the host's role, which this cannot
  see, and an input named `ariaLabel` written statically lands as `arialabel`,
  which does nothing at all. An input whose public name is literally
  `aria-label` is the case left to a reviewer.
- Inline event handlers (`onclick` and the rest) — a security question rather
  than a layout one, and Angular already refuses a binding to them.

## What it does not check

**Whether anyone writes the attribute statically.** A consumer's templates are
not in the package. The finding is that the host would carry the attribute
if they did, which a published component cannot rule out.

**The value of the binding.** `'[attr.title]': 'null'` removes the attribute;
`'[title]': 'null'` writes the text "null" into it. Both take the attribute
away from the consumer, and both count; which value is right is a reviewer's
call.

**A component that means the attribute to stay**, or removes it in code
through `Renderer2` where no declaration shows it. Neither is visible here,
and `ignore` is for both.

**A host that is a native element.** A selector that names no custom element
— `[wrTooltip]`, `button[wr-btn]` — puts the declaration on an element the
consumer chose, where the attribute's native meaning may be exactly what they
want. Such declarations are skipped. One that names a custom element anywhere
in its selector list is checked, directive or component alike.

**A base class from a package that is not installed is REPORTED, not
passed.** Its inputs become the subclass's own, and with no `node_modules`
above the package holding it there is nothing to read them from, so the class
is named as not fully checked. The same goes for a base the reader cannot
follow to a class — a mixin call, say — in this package or an installed one,
and for a base an installed package ships compiled in full mode: its
definition is code for the runtime rather than a declaration to read, and
walking through it as a plain class would pass every input it declares.

**A host directive from a package that is not installed is REPORTED, and its
aliases are still checked.** The names a host exposes from it are written in
the host's own declaration, so a directive from elsewhere exposed as `title`
is found like any other; its host bindings cannot be read, so that finding
may describe an attribute the directive already removes, and says so. What
cannot be read at all is the directive's OWN `hostDirectives`: Angular applies
those to this host as well, under names only that package declares, so a
static attribute can reach an input nobody in this package named. A host
directive the reader cannot follow to a declaration is reported the same way.

**The installed version, not the range.** A dependency is read as it is
installed where the check runs. A range such as `^22.0.0` admits releases
this did not read, and one in which a base gains a global-attribute input or
drops a host binding changes the answer with no change to this package. The
finding names the version for that reason; run the check again when the
dependency moves.

**Full compilation.** An application build emits `ɵɵdefineComponent`, which
this does not read. A package with no partial declaration on a custom element
gets one finding saying nothing was checked, rather than an empty array, and
the finding names the reason: no partial declaration at all, which is full
mode or the wrong directory, or declarations that all sit on an attribute, a
native element or no selector — a headless directive library, which is in
the right form and simply has nothing in scope.

**Two classes with one name** share a finding and an `ignore` entry. A package
that ships the same class in two builds — an `esm2022` and a `fesm2022` copy
— is reported once for it, which is the reason findings are keyed that way.

**`typescript` has to be installed.** It is an optional peer of ngtrue,
needed by this function, by `unresolvableTypes` and by `unexportedTypes`; a
repository building an Angular library has it already, and one without it
gets an error saying so rather than a pass.

## Parameters

### options

[`GlobalAttributeInputsOptions`](../interfaces/GlobalAttributeInputsOptions.md)

## Returns

`Promise`\<readonly `string`[]\>

## Since

0.2.0
