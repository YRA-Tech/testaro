/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  eslint.config.mjs
  Flat ESLint configuration, replacing .eslintrc.json (unsupported since ESLint 9).
*/

// IMPORTS

import js from '@eslint/js';
import globals from 'globals';
import {defineConfig, globalIgnores} from 'eslint/config';

// CONFIGURATION

export default defineConfig([
  globalIgnores([
    // Build output.
    'dist/',
    // Vendored HTML CodeSniffer bundle; not to be reformatted.
    'htmlcs/HTMLCS.js',
    // Vendored Editoria11y bundles.
    'ed11y/',
    // Vendored SureA11y standalone browser bundle (MPL-2.0; not to be modified).
    'surea11y/surea11y.browser.js',
    // Vendored Pour Engine bundle, built with esbuild (see pour/README.md).
    'pour/pour.min.js',
    // Validation fixtures, some of which are intentionally defective.
    'validation/tests/targets/'
  ]),
  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'commonjs',
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    rules: {
      indent: [
        'error',
        2,
        {
          MemberExpression: 0,
          ObjectExpression: 'first'
        }
      ],
      'linebreak-style': [
        'error',
        'unix'
      ],
      quotes: [
        'error',
        'single'
      ],
      semi: [
        'error',
        'always'
      ],
      'no-use-before-define': [
        'error'
      ],
      'brace-style': [
        'error',
        'stroustrup'
      ],
      /*
        Transitional demotions to warnings, so linting can gate changes now.
        These rules have pre-existing violations, some of them latent defects.
        Each is to be restored to an error once its violations are repaired.
      */
      'no-async-promise-executor': 'warn',
      'no-const-assign': 'warn',
      'no-constant-binary-expression': 'warn',
      'no-empty': 'warn',
      'no-undef': 'warn',
      'no-unused-vars': 'warn',
      'no-use-before-define': 'warn',
      'no-useless-assignment': 'warn'
    }
  }
]);
