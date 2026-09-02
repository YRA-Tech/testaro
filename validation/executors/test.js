/*
  © 2022–2023 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  test.js
  Validator for one Testaro test.
  Execution example: npm test focOp
*/

const {validateTest} = require('../validateTest');

// Flushes the standard output and then exits, because lingering browser
// processes otherwise keep the event loop alive indefinitely.
const exitWith = code => {
  process.stdout.write('', () => process.exit(code));
};

const testID = process.argv[2];
validateTest(testID)
.then(result => {
  exitWith(result.success ? 0 : 1);
})
.catch(error => {
  console.log(`ERROR validating test ${testID} (${error.message})`);
  exitWith(1);
});
