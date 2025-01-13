'use strict';

import eslint from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import * as typescriptParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import * as importTypescriptResolver from 'eslint-import-resolver-typescript';
import * as importPlugin from 'eslint-plugin-import';
import eslintPluginPrettier from 'eslint-plugin-prettier';
import sonarjs from 'eslint-plugin-sonarjs';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';

export const OFF = 'off';
export const ERROR = 'error';
export const WARN = 'warn';

const commonRules = {
  ...eslintConfigPrettier.rules,
  'prettier/prettier': [
    ERROR,
    {
      singleQuote: true,
    },
  ],
  'no-console': ERROR,
  curly: [ERROR, 'all'],
  'prefer-const': ERROR,
  'no-irregular-whitespace': WARN,
  'unicorn/better-regex': ERROR,
  'unicorn/catch-error-name': ERROR,
  'unicorn/consistent-empty-array-spread': ERROR,
  'unicorn/filename-case': [
    ERROR,
    {
      cases: {
        kebabCase: true,
        pascalCase: true,
        camelCase: true,
      },
    },
  ],
  'unicorn/empty-brace-spaces': ERROR,
  'unicorn/error-message': ERROR,
  'unicorn/explicit-length-check': ERROR,
  'unicorn/new-for-builtins': ERROR,
  'unicorn/no-anonymous-default-export': ERROR,
  'unicorn/no-array-for-each': ERROR,
  'unicorn/no-array-push-push': ERROR,
  'unicorn/no-await-in-promise-methods': ERROR,
  'unicorn/no-console-spaces': ERROR,
  'unicorn/no-for-loop': ERROR,
  'unicorn/no-instanceof-array': ERROR,
  'unicorn/no-lonely-if': ERROR,
  'unicorn/no-negated-condition': ERROR,
  'unicorn/no-nested-ternary': ERROR,
  'unicorn/no-new-array': ERROR,
  'unicorn/no-new-buffer': ERROR,
  'unicorn/no-typeof-undefined': ERROR,
  'unicorn/no-unnecessary-await': ERROR,
  'unicorn/no-useless-undefined': ERROR,
  'unicorn/numeric-separators-style': ERROR,
  'unicorn/prefer-array-find': ERROR,
  'unicorn/prefer-array-flat-map': ERROR,
  'unicorn/prefer-array-flat': ERROR,
  'unicorn/prefer-array-some': ERROR,
  'unicorn/prefer-date-now': ERROR,
  'unicorn/prefer-export-from': ERROR,
  'unicorn/prefer-math-trunc': ERROR,
  'unicorn/prefer-modern-math-apis': ERROR,
  'unicorn/prefer-negative-index': ERROR,
  'unicorn/prefer-node-protocol': ERROR,
  'unicorn/prefer-optional-catch-binding': ERROR,
  'unicorn/prefer-string-starts-ends-with': ERROR,
  'unicorn/prefer-structured-clone': ERROR,
  'unicorn/prefer-at': ERROR,
  'unicorn/prefer-default-parameters': ERROR,
  'unicorn/prefer-includes': ERROR,
  'unicorn/prevent-abbreviations': [
    ERROR,
    {
      allowList: {
        args: true,
        ctx: true,
        env: true,
        ref: true,
        req: true,
        res: true,
        dev: true,
      },
    },
  ],
  'unicorn/switch-case-braces': ERROR,
  'unicorn/relative-url-style': ERROR,
  'unicorn/prefer-ternary': [ERROR, 'only-single-line'],
  'unicorn/prefer-string-trim-start-end': ERROR,
  'unicorn/prefer-string-slice': ERROR,
  'unicorn/prefer-string-replace-all': ERROR,
  'unicorn/prefer-string-raw': ERROR,
  'unicorn/prefer-set-size': ERROR,
  'unicorn/prefer-set-has': ERROR,
  'unicorn/throw-new-error': ERROR,
  'sonarjs/max-switch-cases': [ERROR, 12],
  'sonarjs/no-all-duplicated-branches': ERROR,
  'sonarjs/no-collapsible-if': ERROR,
  'sonarjs/no-collection-size-mischeck': ERROR,
  'sonarjs/no-duplicate-string': [
    ERROR,
    {
      threshold: 8,
    },
  ],
  'sonarjs/no-duplicated-branches': ERROR,
  'sonarjs/no-extra-arguments': ERROR,
  'sonarjs/no-gratuitous-expressions': ERROR,
  'sonarjs/no-identical-conditions': ERROR,
  'sonarjs/no-identical-expressions': ERROR,
  'sonarjs/no-identical-functions': ERROR,
  // 'sonarjs/no-ignored-return': ERROR, - slowing down the linting
  'sonarjs/no-inverted-boolean-check': ERROR,
  'sonarjs/no-nested-switch': ERROR,
  'sonarjs/no-nested-template-literals': WARN,
  'sonarjs/no-one-iteration-loop': ERROR,
  'sonarjs/no-redundant-boolean': ERROR,
  'sonarjs/no-redundant-jump': ERROR,
  'sonarjs/no-same-line-conditional': ERROR,
  'sonarjs/no-small-switch': ERROR,
  'sonarjs/no-unused-collection': ERROR,
  'sonarjs/no-use-of-empty-return-value': ERROR,
  'sonarjs/no-useless-catch': ERROR,
  'sonarjs/non-existent-operator': ERROR,
  'sonarjs/prefer-immediate-return': ERROR,
  'sonarjs/prefer-object-literal': ERROR,
  'sonarjs/prefer-single-boolean-return': ERROR,
  'sonarjs/cognitive-complexity': [WARN, 16],
  'sonarjs/prefer-while': ERROR,
  'import/first': ERROR,
  'import/no-self-import': ERROR,
  'import/no-named-default': ERROR,
  'import/order': [
    ERROR,
    {
      'newlines-between': 'always',
      groups: [
        ['builtin', 'external'],
        'internal',
        'parent',
        'sibling',
        'type',
        'index',
        'object',
      ],
      pathGroupsExcludedImportTypes: ['builtin'],
      alphabetize: {
        order: 'asc',
        caseInsensitive: false,
      },
    },
  ],
  'import/extensions': [
    ERROR,
    'always',
    {
      ignorePackages: true,
      pattern: {
        ts: 'never',
      },
    },
  ],
};

export const config = [
  {
    ignores: [
      '**/dist/**/*',
      '**/public/**/*',
      '**/node_modules/**/*',
      '**/coverage/**/*',
      '**/build/**/*',
      '**/html/**/*',
    ],
  },
  importPlugin.configs?.typescript,
  eslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        requireConfigFile: false,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      sourceType: 'module',
      globals: globals.node,
    },
    files: ['*.js', '**/*.js', '*.mjs', '**/*.mjs', '**/*.cjs'],
    plugins: {
      sonarjs,
      unicorn,
      import: importPlugin,
      prettier: eslintPluginPrettier,
    },
    rules: commonRules,
    settings: {
      'import/internal-regex': String.raw`^@fsmoothy(\/|$)`,
      // https://github.com/import-js/eslint-plugin-import/issues/2556#issuecomment-1419518561
      'import/parsers': {
        espree: ['.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx'],
      },
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        project: 'tsconfig.json',
      },
      sourceType: 'module',
      globals: globals.node,
    },
    settings: {
      'import/internal-regex': String.raw`^@fsmoothy(\/|$)`,
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
    plugins: {
      sonarjs,
      unicorn,
      prettier: eslintPluginPrettier,
      import: importPlugin,
      '@typescript-eslint': typescript,
      'import/typescript': importTypescriptResolver,
    },
    rules: {
      ...commonRules,
      ...typescript.configs.recommendedTypeChecked,
      'no-unused-vars': OFF,
      'no-undef': OFF,
      'no-redeclare': OFF,
      'no-dupe-class-members': OFF,
      '@typescript-eslint/no-redeclare': ERROR,
      '@typescript-eslint/no-explicit-any': OFF,
      '@typescript-eslint/no-unused-vars': [
        ERROR,
        {
          vars: 'local',
          ignoreRestSiblings: false,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/ban-ts-comment': [
        ERROR,
        {
          'ts-expect-error': 'allow-with-description',
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-check': false,
          minimumDescriptionLength: 5,
        },
      ],
      '@typescript-eslint/consistent-type-imports': ERROR,
      '@typescript-eslint/prefer-optional-chain': OFF,
      '@typescript-eslint/no-non-null-assertion': OFF,
    },
  },
];

export default config;
