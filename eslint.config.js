import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Small on purpose.
 *
 * The rules this repository actually cares about — no import across an entry
 * point, no check that cannot fail — are not expressible as lint rules, and
 * they are enforced by tests instead, where the reason can be written down
 * beside the assertion. What is left for eslint is the class of mistake a type
 * checker does not catch and a reviewer should not have to: a floating promise
 * from an async assertion, an `any` that erases the thing being checked.
 *
 * `eslint-config-prettier` comes last so formatting stays prettier's argument
 * and not a second one.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      // Emitted by `ngc`. Angular's output references `ngDevMode`, a global the
      // build tool defines; linting generated code says nothing about this repo.
      '.fixtures/**',
      'docs/api/**',
      'docs/.vitepress/cache/**',
      'docs/.vitepress/dist/**',
      // Fake packages, one of which imports something nobody installed on
      // purpose. See the note in tsconfig.json.
      'src/node/fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    // The fixtures under `src/testing/fixtures/` declare members that exist to
    // be found by a definition scan and are never read by the class itself.
    files: ['src/**/fixtures/**/*.ts'],
    rules: { '@typescript-eslint/no-unused-vars': 'off' },
  },
  {
    // The config itself and the two build scripts are plain JavaScript and sit
    // outside every tsconfig, so the type-aware rules have no program to ask.
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
    languageOptions: {
      ...tseslint.configs.disableTypeChecked.languageOptions,
      parserOptions: { projectService: false, project: false },
      // Spelled out rather than taken from the `globals` package: four names is
      // not worth a dependency, and an explicit list is a list somebody read.
      globals: { console: 'readonly', process: 'readonly', URL: 'readonly', URLSearchParams: 'readonly' },
    },
  },
  prettier,
);
