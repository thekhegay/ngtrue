# globalAttributeInputs

`ngtrue/node`

Every input named after an HTML global attribute — `title`, `id`, `hidden` and
the rest of a short list — on a component whose host has no binding for that
attribute. One sentence each; an empty array is a pass.

## A runnable example

```ts
import { globalAttributeInputs } from 'ngtrue/node';

it('keeps a static title off the host', async () => {
  expect(await globalAttributeInputs({ packageDir: 'dist' })).toEqual([]);
});
```

Point it at the **built** package. It reads the JavaScript the package ships,
so a source tree has nothing for it to read.

## The defect

Write an attribute statically on a component and Angular does two things: it
sets the input of that name, and it leaves the attribute on the element.

```html
<wr-result-404 title="Lost?" />
```

The input receives `"Lost?"` and the heading renders it. The host element also
carries `title="Lost?"`, so the browser draws its own tooltip over the whole
component, and nothing anywhere says so. A bound `[title]="…"` sets only the
input, which is why a test suite that binds everything never sees it.

The fix is one host binding. It runs after the static attribute is written, and
binding `null` removes it:

```ts
@Component({
  selector: 'wr-result-404',
  host: { '[attr.title]': 'null' },
  // …
})
export class WrResult404 {
  readonly title = input('404');
}
```

`title` is the common case and not the only one. An `id` input puts the id on
the host, where a `<label for>` finds it instead of the control inside. A
`hidden` or `popover` input makes the whole component vanish. Renaming the input
fixes it as well — only the public name reaches a template.

## How it answers

It reads the partial declarations — the `ɵɵngDeclareComponent` and
`ɵɵngDeclareDirective` calls every published Angular library carries — with the
TypeScript parser, starting from each JavaScript file `exports` reaches and
following relative imports from there.

A component's inputs are merged the way Angular merges them at runtime: its own,
the ones its `hostDirectives` expose under the alias the host gives them, the
ones those directives expose from host directives of their own — Angular puts
those on the same element — and everything a base class in the same package
contributes, followed through the whole `extends` chain and across entry
points. Host bindings are merged the same way, so a base class or a host
directive that binds the attribute away counts.

A base TypeScript keeps in a local is followed through it. A class with a
member that carries a standard decorator is emitted inside a function, as
`let _classSuper = Base; … return class … extends _classSuper`, which is how
ng-zorro-antd ships several of its components.

Names are compared lowercased. `tabIndex="0"` written statically sets an input
called `tabIndex` and lands on the element as `tabindex`.

Only a property binding counts as the fix, `[attr.title]` or the DOM property
`[title]`. A static host attribute, `host: { title: '' }`, does not: Angular
merges a template's own attributes last, so the consumer's value wins.

## The attributes

`title`, `id`, `hidden`, `lang`, `dir`, `tabindex`, `accesskey`, `draggable`,
`spellcheck`, `contenteditable`, `inert`, `popover` and `role`. Each one does
something to an element that never asked for it: a tooltip, a focus stop, a
change of language or direction, a component that disappears, a different
announcement from a screen reader.

The rest of the spec's global attributes are left out on purpose, and the API
reference says why for each. `autofocus` does nothing on a host that is not
focusable, `class` and `style` are how a consumer styles a host, and the
keyboard hints only act on an editable element.

## Accepting a finding

```ts
await globalAttributeInputs({
  packageDir: 'dist',
  ignore: ['WrWindow.title', 'WrLegacyField'],
});
```

`'WrWindow.title'` accepts one input: the component wants the native attribute
to stay, or removes it in code where no declaration shows it.

A bare class name accepts that the class could not be checked completely,
because it extends a class from another package or carries a host directive
from one. It does not silence that class's input findings.

An `ignore` entry that matches nothing is reported, so the list cannot outlive
the code it excuses.

## What it reports instead of passing

- **A base class from another package.** Its inputs become the subclass's own
  and cannot be read from here, so the class is named as not fully checked. The
  same goes for a base it cannot follow to a class, such as a mixin call.
- **A host directive from another package.** Angular applies that directive's
  own host directives to your host too, under names only its package declares,
  so the class is named as not fully checked. The names your host exposes from
  it are still checked.
- **A package with nothing on a custom element.** One finding says nothing was
  checked, and why. With no partial declarations at all, the package was
  compiled in full mode or the path is the wrong directory. With declarations
  that all sit on an attribute selector, a native element or no selector, it is
  a headless directive library, built the right way, with nothing in scope.
- **A package with no `exports`.** There is no list of files to start from.

## What it does not check

**Whether anyone writes the attribute statically.** Consumers' templates are not
in the package. The finding is that the host would carry it if they did.

**The value of the host binding.** `'[attr.title]': 'null'` removes the
attribute, while `'[title]': 'null'` writes the text "null" into it. Both count
as a binding, and which one is right is for a reviewer.

**Hosts that are native elements.** A selector that names no custom element,
such as `[wrTooltip]` or `button[wr-btn]`, puts the declaration on an element
the consumer chose, where the native attribute may be exactly what they want.
Those are skipped.

**The host bindings of a host directive from another package.** The names your
host exposes from it are in your own declaration and are checked, but its
bindings are not readable, so such a finding may describe an attribute that
directive already removes. The message says so.

**`typescript` must be installed.** It is an optional peer of ngtrue, needed by
this export, by [`unresolvableTypes`](/guide/unresolvable-types) and by
[`unexportedTypes`](/guide/unexported-types). A repository building an Angular
library already has it, and one without it gets an error saying so rather than
a pass.
