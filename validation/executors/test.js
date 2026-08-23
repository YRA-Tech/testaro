/*
  © 2022–2023 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  test.js
  Validator for one Testaro test.
  Execution example: npm test focOp
  Exits with status 0 only if the test satisfied all of its expectations.
*/

const {validateTest} = require('../validateTest');

validateTest(process.argv[2])
.then(result => {
  process.exitCode = result.passed ? 0 : 1;
})
.catch(error => {
  console.log(`ERROR: Validation failed unexpectedly (${error.message})`);
  process.exitCode = 1;
});
