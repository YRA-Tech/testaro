/*
  © 2022–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  tests.js
  Validator for Testaro tests.
  Execution examples:
    npm run tests            validate every rule in the registry
    npm run tests -- focInd allCaps
                             validate only the named rules
  The rules to validate are taken from the rule registry in tests/testaro.js, not from the names of
  the files in the testaro directory, because that directory now also holds TypeScript sources and
  declaration files, whose names do not identify additional rules. A failure of one rule does not
  stop the others: each is validated in a try block, and the exit status reports the total.
*/

// IMPORTS

const {allRules} = require('../../tests/testaro');
const {validateTest} = require('../validateTest');

// OPERATION

(async () => {
  const requestedIDs = process.argv.slice(2).filter(argument => ! argument.startsWith('-'));
  const registryIDs = allRules.map(rule => rule.id);
  // Validate the requested rules, or all registered rules if none was requested.
  const testIDs = requestedIDs.length ? requestedIDs : registryIDs;
  // If any requested rule is not in the registry:
  const unknownIDs = testIDs.filter(testID => ! registryIDs.includes(testID));
  if (unknownIDs.length) {
    // Report this, because a typo would otherwise look like a validation failure.
    console.log(`WARNING: Not in the rule registry: ${unknownIDs.join(', ')}`);
  }
  const results = [];
  // For each rule to be validated:
  for (const testID of testIDs) {
    console.log(`### Validating Testaro test ${testID}`);
    // Validate it, treating any thrown error as a failure of that rule alone.
    try {
      results.push(await validateTest(testID));
    }
    catch(error) {
      console.log(`######## Failure: ${testID} threw an error (${error.message})\n`);
      results.push({testID, passed: false, failures: [`Threw an error (${error.message})`]});
    }
  }
  // Summarize the outcomes.
  const failed = results.filter(result => ! result.passed);
  console.log('\n======== Validation summary ========');
  console.log(`Rules validated: ${results.length}`);
  console.log(`Passed: ${results.length - failed.length}`);
  console.log(`Failed: ${failed.length}`);
  if (failed.length) {
    failed.forEach(result => {
      console.log(`  ${result.testID} (${result.failures.length} failure(s))`);
    });
  }
  process.exitCode = failed.length ? 1 : 0;
})();
