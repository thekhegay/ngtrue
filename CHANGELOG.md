# Changelog

## [0.3.0](https://github.com/thekhegay/ngtrue/compare/v0.2.0...v0.3.0) (2026-10-23)

### ⚠ BREAKING CHANGES

* assertSignalFormsControl requires a form-side write to leave the field pristine

### Features

* assertSignalFormsControl requires a form-side write to leave the field pristine ([d94e37e](https://github.com/thekhegay/ngtrue/commit/d94e37e6340569a90655443807623b870b01fb9a))
* **node:** add an ignore list to unresolvableTypes ([b00e3c6](https://github.com/thekhegay/ngtrue/commit/b00e3c6fab20622dc47af4df4d69e31a82a97eda))
* **node:** read base classes and host directives from installed dependencies ([978da0d](https://github.com/thekhegay/ngtrue/commit/978da0dd69a4a498779287994520f478091dee47))
* **node:** report entry points a test runner or a server cannot import ([72e4e1b](https://github.com/thekhegay/ngtrue/commit/72e4e1b75e44a121bf6c2078145b1e0bc935b97f))
* **testing:** report subscriptions to zone events a zoneless app never emits ([71a8411](https://github.com/thekhegay/ngtrue/commit/71a841149bd5cf7f3fc6df143e4b8c1f293e1bed))

### Bug Fixes

* **node:** follow bases through the standard decorator wrapper and stop blaming full mode ([8b83c03](https://github.com/thekhegay/ngtrue/commit/8b83c039b5654f88d96776398814e283941642c8))
* **node:** skip the same stylesheet conditions in unresolvableTypes as in unexportedTypes ([fd3a901](https://github.com/thekhegay/ngtrue/commit/fd3a901c8fafca6556bee712f1a8d59509113d1a))

## [0.2.0](https://github.com/thekhegay/ngtrue/compare/v0.1.1...v0.2.0) (2026-10-12)

### ⚠ BREAKING CHANGES

* assertSignalFormsControl requires focus to reach the control

### Features

* assertSignalFormsControl requires focus to reach the control ([f6e1448](https://github.com/thekhegay/ngtrue/commit/f6e144826c56f69b64a36864ee299cf7451e2ff7))
* **node:** add unexportedTypes for public types no subpath exports ([91530b0](https://github.com/thekhegay/ngtrue/commit/91530b0aec0efce663595bd168be41ee27d852b7))
* **node:** check the angular peer floor against partial declarations ([6585617](https://github.com/thekhegay/ngtrue/commit/658561722caef79c44115e0395454a2efd8cd998))
* **node:** report inputs whose static attribute also lands on the host ([c30e5b4](https://github.com/thekhegay/ngtrue/commit/c30e5b4907b1466a10fd162c9dff59757536f28d))
* **node:** report schematics and migrations the cli cannot load ([ade6990](https://github.com/thekhegay/ngtrue/commit/ade6990283d8fa3fd249eef360582fe4ca78fd74))

### Bug Fixes

* **node:** stop reading text as imports and probing stylesheet-only subpaths ([4e11314](https://github.com/thekhegay/ngtrue/commit/4e11314c0439c6cc5b7ae4db7cf0f56a6eaf7451))
* **testing:** resolve the control through host directives the way angular does ([3acedcd](https://github.com/thekhegay/ngtrue/commit/3acedcd7d845223f41fb306a2eb398f5ee8e67d2))

## [0.1.1](https://github.com/thekhegay/ngtrue/compare/v0.1.0...v0.1.1) (2026-09-23)

## 0.1.0 (2026-09-23)

### Features

* conformance and packaging checks for angular libraries ([9595d1d](https://github.com/thekhegay/ngtrue/commit/9595d1d9a1c88cae0286040e689cd9868f4dcb90))
