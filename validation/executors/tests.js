/*
  © 2022–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  tests.js
  Validator for Testaro tests.
*/

// IMPORTS

require('dotenv').config({quiet: true});
const fs = require('fs').promises;
const {spawn} = require('child_process');

// CONSTANTS

const ruleDir = `${__dirname}/../../testaro`;
const validatorDir = `${__dirname}/../tests/jobProperties`;
// Rules that ask an AI model to classify candidate instances.
const aiRuleIDs = ['allCaps'];
// Validators of features other than rules, run after the rule validators.
const featureValidatorIDs = ['checkpoint'];
// Maximum number of seconds allowed for the validation of one rule.
const ruleTimeLimit = 180;
/*
  Rules whose validations currently fail, with the reasons. They do not make
  the validation as a whole fail, so a failure of a healthy rule is blocking
  while these known failures are being repaired. When a repair makes a rule
  pass, it is to be removed from knownFailures.json.
*/
const knownFailures = require('../knownFailures.json');

// FUNCTIONS

/*
  Validates one rule in a child process, so a defective rule cannot crash or
  hang the whole validation and so each job's browser processes are reaped.
  Returns whether the validation succeeded.
*/
const validateInChild = testID => new Promise(resolve => {
  const child = spawn(
    process.execPath, [`${__dirname}/test.js`, testID], {stdio: 'inherit'}
  );
  const timer = setTimeout(() => {
    console.log(`######## Failure: Validation of ${testID} timed out (${ruleTimeLimit}s)\n`);
    child.kill('SIGKILL');
  }, 1000 * ruleTimeLimit);
  child.on('close', code => {
    clearTimeout(timer);
    resolve(code === 0);
  });
  child.on('error', error => {
    clearTimeout(timer);
    console.log(`######## Failure: Validation of ${testID} could not start (${error.message})\n`);
    resolve(false);
  });
});

// OPERATION

// Get the names of the Testaro rule files and the validator files.
Promise.all([fs.readdir(ruleDir), fs.readdir(validatorDir)])
// When they arrive:
.then(async ([ruleFileNames, validatorFileNames]) => {
  // Get the rule IDs and the IDs of the rules with validators.
  // Rule modules are the JavaScript files in the rule directory, except the generated registry.
  const ruleIDs = ruleFileNames
  .filter(name => name.endsWith('.js') && name !== 'registry.js')
  .map(name => name.slice(0, -3));
  const validatorIDs = validatorFileNames
  .filter(name => name.endsWith('.json'))
  .map(name => name.slice(0, -5));
  // Identify the rules without validators and the validators without rules.
  const unvalidatedIDs = ruleIDs.filter(id => ! validatorIDs.includes(id));
  const orphanIDs = validatorIDs.filter(
    id => ! ruleIDs.includes(id) && ! featureValidatorIDs.includes(id)
  );
  // Identify the AI-dependent rules to be skipped for lack of an API key.
  const skippedIDs = process.env.ANTHROPIC_API_KEY
    ? []
    : ruleIDs.filter(id => aiRuleIDs.includes(id));
  // Initialize the results.
  const failedIDs = [];
  const knownFailedIDs = [];
  const recoveredIDs = [];
  let validatedCount = 0;
  // For each rule with a validator, and then each feature validator:
  const featureIDs = featureValidatorIDs.filter(id => validatorIDs.includes(id));
  for (
    const testID of ruleIDs
    .filter(id => validatorIDs.includes(id) && ! skippedIDs.includes(id))
    .concat(featureIDs)
  ) {
    // Validate the rule.
    console.log(`### Validating Testaro test ${testID}`);
    const succeeded = await validateInChild(testID);
    validatedCount++;
    if (succeeded && knownFailures[testID]) {
      recoveredIDs.push(testID);
    }
    else if (! succeeded) {
      (knownFailures[testID] ? knownFailedIDs : failedIDs).push(testID);
    }
  }
  // Report a summary.
  console.log('\n#### Validation summary');
  console.log(`Rules validated: ${validatedCount}`);
  console.log(`Rules failing validation: ${failedIDs.length + knownFailedIDs.length}`);
  if (failedIDs.length) {
    console.log(`  Failing rules: ${failedIDs.join(', ')}`);
  }
  if (knownFailedIDs.length) {
    console.log(`  Known-failing rules, not blocking: ${knownFailedIDs.join(', ')}`);
  }
  if (recoveredIDs.length) {
    console.log(
      `Warning - rules now passing; remove them from knownFailures.json: ${recoveredIDs.join(', ')}`
    );
  }
  if (skippedIDs.length) {
    console.log(
      `Warning - AI-dependent rules skipped because ANTHROPIC_API_KEY is not set: ${
        skippedIDs.join(', ')
      }`
    );
  }
  if (unvalidatedIDs.length) {
    console.log(`Warning - rules without validators: ${unvalidatedIDs.join(', ')}`);
  }
  if (orphanIDs.length) {
    console.log(`Warning - validators without rules: ${orphanIDs.join(', ')}`);
  }
  // Make the validation failable by CI and other callers.
  process.exitCode = failedIDs.length ? 1 : 0;
});
