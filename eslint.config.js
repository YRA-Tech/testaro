/*
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  eslint.config.js
  ESLint configuration.
  ESLint 9 and later ignore the .eslintrc.json files, so “npx eslint .” did nothing but report a
  missing configuration. This file restores linting, translating those files rule for rule. The
  htmlcs directory keeps its own looser rules, because HTMLCS.js is vendored and must not be
  reformatted, and the JavaScript that tsc emits from the TypeScript sources is not linted, because
  its formatting is tsc's, not the project's.
*/

// IMPORTS

const fs = require('fs');
const path = require('path');
const js = require('@eslint/js');
const globals = require('globals');

// CONSTANTS

// Directories that hold TypeScript sources whose emitted JavaScript is committed beside them.
const emitDirs = ['.', 'procs', 'testaro'];
// Rules of the project.
const projectRules = {
  'indent': ['error', 2, {MemberExpression: 0, ObjectExpression: 'first'}],
  'linebreak-style': ['error', 'unix'],
  'quotes': ['error', 'single'],
  'semi': ['error', 'always'],
  'no-use-before-define': ['error'],
  'brace-style': ['error', 'stroustrup']
};
// Environments that the project code runs in.
const environmentGlobals = {
  ...globals.browser,
  ...globals.commonjs,
  ...globals.node
};

// FUNCTIONS

/*
  Returns the paths of the JavaScript files that tsc emits. Computed, rather than listed, so that
  converting another module to TypeScript does not require an edit here.
*/
const getEmitPaths = () => {
  const emitPaths = [];
  emitDirs.forEach(dirName => {
    let fileNames;
    try {
      fileNames = fs.readdirSync(path.join(__dirname, dirName));
    }
    catch {
      return;
    }
    fileNames
    .filter(fileName => fileName.endsWith('.ts') && ! fileName.endsWith('.d.ts'))
    .forEach(fileName => {
      const jsName = `${fileName.slice(0, -3)}.js`;
      if (fileNames.includes(jsName)) {
        emitPaths.push(dirName === '.' ? jsName : `${dirName}/${jsName}`);
      }
    });
  });
  return emitPaths;
};

// OPERATION

module.exports = [
  // Artifacts, dependencies, vendored bundles, and tsc output, which no project rule applies to.
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'ed11y/**',
      'temp/**',
      'tmp/**',
      'validation/tests/old/**',
      ... getEmitPaths()
    ]
  },
  // Rules for the project code.
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'commonjs',
      globals: environmentGlobals
    },
    rules: {
      ... js.configs.recommended.rules,
      ... projectRules
    }
  },
  /*
    Globals that Testaro injects into the page before the code that names them runs. They are
    undefined in the module scope, so without this ESLint would report them as undefined.
  */
  {
    files: ['testaro/**/*.js', 'tests/ed11y.js'],
    languageOptions: {
      globals: {
        Ed11y: 'readonly',
        getXPath: 'readonly'
      }
    }
  },
  // Rules for the vendored HTML CodeSniffer code, which must not be reformatted.
  {
    files: ['htmlcs/**/*.js'],
    languageOptions: {
      ecmaVersion: 5,
      sourceType: 'script',
      globals: environmentGlobals
    },
    rules: {
      ... js.configs.recommended.rules,
      'indent': ['error', 2, {MemberExpression: 0, ObjectExpression: 'first'}],
      'linebreak-style': ['error', 'unix'],
      'quotes': ['error', 'single'],
      'semi': ['error', 'always'],
      'brace-style': ['error', 'stroustrup'],
      'no-undef': 'off',
      'no-redeclare': 'off',
      'no-unused-vars': 'off',
      'no-empty': 'off',
      'no-prototype-builtins': 'off',
      'no-cond-assign': 'off',
      'no-fallthrough': 'off',
      'no-constant-condition': 'off',
      // Off because the project rules above do not apply to this vendored file.
      'no-use-before-define': 'off',
      'no-useless-assignment': 'off',
      'block-spacing': ['error', 'never'],
      'array-bracket-spacing': ['error', 'never'],
      'space-before-function-paren': ['error', 'always'],
      'space-in-parens': ['error', 'never'],
      'object-curly-spacing': ['error', 'never']
    }
  }
];
