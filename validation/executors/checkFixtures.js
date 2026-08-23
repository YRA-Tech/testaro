/*
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  checkFixtures.js
  Validator of the validation fixtures.
  Execution example: npm run checkFixtures
  Exits with status 0 only if no fixture has a defect. Coverage gaps are reported as warnings and
  do not affect the exit status.
*/

const {checkFixtures} = require('../checkFixtures');

const {errors, warnings, fixtureCount, ruleCount} = checkFixtures();
console.log(`Checked ${fixtureCount} fixture(s) against ${ruleCount} registered rule(s)`);
if (warnings.length) {
  console.log(`\nWarnings (${warnings.length}):`);
  warnings.forEach(warning => {
    console.log(`  - ${warning}`);
  });
}
if (errors.length) {
  console.log(`\nErrors (${errors.length}):`);
  errors.forEach(error => {
    console.log(`  - ${error}`);
  });
  console.log('\n######## Failure: The validation fixtures have defects');
  process.exitCode = 1;
}
else {
  console.log('\n######## Success: The validation fixtures have no defects');
}
