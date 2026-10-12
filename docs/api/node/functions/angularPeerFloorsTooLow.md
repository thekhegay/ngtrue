[ngtrue](../../index.md) / [node](../index.md) / angularPeerFloorsTooLow

# Function: angularPeerFloorsTooLow()

> **angularPeerFloorsTooLow**(`options`): `Promise`\<readonly `string`[]\>

Defined in: [src/node/angular-peer-floors-too-low.ts:146](https://github.com/thekhegay/ngtrue/blob/main/src/node/angular-peer-floors-too-low.ts#L146)

Every way the `@angular/core` peer range admits an Angular whose linker will
refuse the package's compiled output, as one sentence each. An empty array is
a pass.

```ts
it('admits no Angular that cannot link it', async () => {
  expect(await angularPeerFloorsTooLow({ packageDir: 'dist' })).toEqual([]);
});
```

A library is published in partial-compilation mode: every component,
directive, pipe, injectable and service is shipped as a `ɵɵngDeclare*` call
that the CONSUMER's build links into a definition. Each call carries the
oldest linker that can read it, `minVersion`, and the version that wrote it.
The linker in `@angular/compiler-cli` compares that `minVersion` with its own
version and, below it, throws "This application depends upon a library
published using Angular version X, which requires Angular version Y or newer
to work correctly" — at the consumer's `ng build`, about a package the
consumer did not write, under a peer range that told npm the install was
fine.

So the check is that condition, not an estimate of it. It collects every
declaration in the JavaScript the `exports` map reaches, takes the highest
`minVersion`, and compares it with the lowest version the `@angular/core`
peer range admits. Both sides lose their prerelease first, because the
linker's `getRange` strips it from both: a declaration needing
`22.0.0-next.3` links on `22.0.0-next.0`, which plain semver would call
older. The lowest admitted version is the only one worth asking about,
because the linker accepts everything above the first version that accepts.

## Where the question came from

Other libraries' users, filing the linker's message against a range that
promised otherwise — the range written for the Angular the library started
on, the build moved to a newer one:

- dmacfarlane/angular-mentions#238, "Incorrect peer dependency range": a
  peer of `>=7.2.0` over declarations needing 14.0.0
  (https://github.com/dmacfarlane/angular-mentions/issues/238), and #244, an
  Angular 12 app hitting the same 14.0.0 component
  (https://github.com/dmacfarlane/angular-mentions/issues/244).
- zefoy/ngx-color-picker#317, an Angular 13 app and a directive declaring
  14.0.0 (https://github.com/zefoy/ngx-color-picker/issues/317).
- gund/ng-dynamic-component#473, the same against an Angular 13 build
  (https://github.com/gund/ng-dynamic-component/issues/473).

Every one of those builds passed whatever the library's own CI ran, because
nothing on the publishing side compares the two numbers: the refusal happens
only in a consumer's build, on an Angular the library's repository no longer
installs.

## What it reads, and how

Every `exports` target that names JavaScript (`.js`, `.mjs`, `.cjs`), under
every condition, with wildcard subpaths expanded against the files on disk —
then every file those reach through a relative import, which is where a
bundler puts shared chunks. Static, re-exported and dynamic imports alike:
`@angular/build:library` gives the dependencies of a `@defer` block a chunk
that only `import()` reaches, and the declaration that sets the floor can be
the one in it. A file that imports another subpath by the package's own name
needs no following, because that subpath is a target and is read anyway. A
target that does not exist is skipped: no linker will see what is not there,
and [unresolvedExports](unresolvedExports.md) is the check whose subject that is.

Declarations are read as TEXT, matching the two keys the compiler writes
first in every call — `minVersion`, then `version`, as string literals, on
one line or across several. Text rather than a parse because a parser would
have to accept whatever syntax the build emitted, and the compiler's output
is regular enough that what does not match it is better reported than
guessed at. Three consequences, stated rather than fixed: a declaration
spelled out inside a string or a comment is read as if it were code, which
can only add a finding and never hide one; a call whose callee is a computed
member such as `i0["ɵɵngDeclareComponent"]`, or sits in parentheses, is not
matched, which a linker would read and no Angular package builder emits; and
a chunk loaded through a computed specifier is not followed, which bundlers
do not emit for their own chunks.

## What it reports instead of passing

- **A declaration it found and could not read.** Its keys in another order,
  or a `minVersion` that is not a version. The linker reads the first through
  an AST and may be fine, but the one unread declaration could be the one
  needing the newest Angular.
- **No declarations at all.** A full-compilation build, a package with no
  Angular code in it, or declaration names a bundler escaped as `\u0275` —
  which the linker would not find either, since it too looks for the literal
  name. There is no `minVersion` to hold the range to, and an empty list
  would read as a range that fits.
- **Nothing to read.** No `exports`, or JavaScript targets that do not exist
  (a source tree checked by mistake for the built package).
- **No `@angular/core` peer**, a range semver cannot read (a `workspace:`
  protocol checked before publishing rewrites it), or a range nothing
  satisfies.

## What a pass does not mean

**A pass is not "supported".** It says that every Angular the range admits
can LINK the package, which is a narrower thing than working:

- **Types are out of scope.** The `.d.ts` files reference the `@angular/core`
  types of the version that built them, and an older consumer's compiler can
  fail on those with no linker involved.
- **Runtime APIs are out of scope.** A declaration's `minVersion` is about
  the declaration's FORMAT. Code that calls an API added after that version
  links fine and throws at runtime, and only a test run on the floor version
  finds it.
- **Angular's own policy is out of scope, and it is stricter.** "Ensuring
  library version compatibility" on angular.dev asks for an application
  built with the same Angular as each of its libraries or a later one, and
  does not support an earlier one. A range reaching below the version that
  built the package can pass here and still be a range Angular does not
  stand behind; a library that wants Angular's guarantee sets its floor to
  its build version, which this check then passes as well.
- **The linker's version is the consumer's `@angular/compiler-cli`**, which
  Angular releases in lockstep with `@angular/core`. An install that mixes
  versions is not something a library's range can describe.

**`semver` has to be installed.** It is an optional peer dependency of
ngtrue, and this is the only function that needs it: reading the lowest
version out of a range like `^14.2.0 || >=15.0.0-rc.0` is range arithmetic,
and an approximation of it would agree with the real thing on every range
that was already simple.

## Parameters

### options

[`AngularPeerFloorsTooLowOptions`](../interfaces/AngularPeerFloorsTooLowOptions.md)

## Returns

`Promise`\<readonly `string`[]\>

## Since

0.2.0
