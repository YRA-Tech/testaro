/*
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  acts.js
  Validator for act types whose behavior no rule fixture exercises.
  The rule fixtures in validation/tests/jobProperties validate the rules of the testaro tool, so
  they perform launch, url, and test acts only. This validator covers the control-flow acts, whose
  absence from the fixtures let a next act stay broken: its index variable was a constant, so a
  jump threw a TypeError, and its condition was checked against the last act of the job instead of
  the last performed one.
  Execution example: npm run acts
  Exits with status 0 only if every expectation held.
*/

// IMPORTS

const fs = require('fs');
const {doJob} = require('../../run');

// CONSTANTS

const actsDir = `${__dirname}/../tests/acts`;
const defaultBrowserID = process.env.TESTARO_VALIDATION_BROWSER || 'webkit';

// FUNCTIONS

// Returns a job performing the acts of a file in the acts directory.
const getJob = (jobName, acts) => ({
  id: '250101T0000-acts-00',
  what: jobName,
  strict: true,
  standard: 'only',
  device: {
    id: 'default',
    windowOptions: {
      reducedMotion: 'no-preference'
    }
  },
  browserID: defaultBrowserID,
  timeLimit: 60,
  creationTimeStamp: '250101T0000',
  executionTimeStamp: '250101T0000',
  sendReportTo: '',
  target: {
    what: 'page for act validation',
    url: 'file://validation/tests/targets/docType/good.html'
  },
  sources: {
    script: 'acts',
    batch: 'acts',
    mergeID: 'aaa',
    requester: ''
  },
  acts
});
// Returns whether an act was performed, which a skipped act was not.
const wasPerformed = act => Boolean(act && (act.result || act.data));
// Validates the next act and returns an array of failure descriptions.
const checkNext = report => {
  const failures = [];
  const {acts} = report;
  // Each act, identified by the name or the type that the fixture gives it.
  const [, baseline, jumpNext, skippedByJump, nameNext, skippedByName, landing] = acts;
  if (report.jobData && report.jobData.aborted) {
    failures.push(`Job aborted (${report.jobData.abortMessage || 'no message'})`);
  }
  if (! wasPerformed(baseline)) {
    failures.push('The act before the first next act was not performed');
  }
  // Each next act is to have found its condition true and so required a jump.
  [['jump', jumpNext], ['next', nameNext]].forEach(([label, act]) => {
    if (! act || ! act.result) {
      failures.push(`The ${label} next act has no result`);
    }
    else if (! act.result.jumpRequired) {
      failures.push(
        `The ${label} next act did not require a jump (its condition was ${
          JSON.stringify(act.result.value)
        })`
      );
    }
  });
  // Each act that a jump is to have skipped is to have no result and no data.
  [['jump', skippedByJump], ['next', nameNext && skippedByName]].forEach(([label, act]) => {
    if (wasPerformed(act)) {
      failures.push(`The act that the ${label} was to skip was performed`);
    }
  });
  // The named act that the second jump is to have reached is to have been performed.
  if (! wasPerformed(landing)) {
    failures.push('The act named landing, the target of the second jump, was not performed');
  }
  return failures;
};
// Validators of the act files, by file name.
const checkers = {
  next: checkNext
};

// OPERATION

(async () => {
  const results = [];
  const fileNames = fs.readdirSync(actsDir).filter(fileName => fileName.endsWith('.json'));
  // For each act file:
  for (const fileName of fileNames) {
    const jobName = fileName.replace(/\.json$/, '');
    console.log(`### Validating acts of ${jobName}`);
    const checker = checkers[jobName];
    // If no validator knows how to check it:
    if (! checker) {
      console.log(`######## Failure: No checker for ${jobName}\n`);
      results.push({jobName, failures: [`No checker for ${jobName}`]});
      continue;
    }
    let failures;
    try {
      const {acts} = JSON.parse(fs.readFileSync(`${actsDir}/${fileName}`, 'utf8'));
      const report = await doJob(getJob(jobName, acts));
      failures = checker(report);
    }
    catch(error) {
      failures = [`Threw an error (${error.message})`];
    }
    if (failures.length) {
      console.log(`######## Failure: ${jobName} has ${failures.length} failure(s):`);
      failures.forEach(failure => {
        console.log(`  - ${failure}`);
      });
      console.log('');
    }
    else {
      console.log(`######## Success: ${jobName} behaved as specified\n`);
    }
    results.push({jobName, failures});
  }
  const failed = results.filter(result => result.failures.length);
  console.log('\n======== Act validation summary ========');
  console.log(`Act files validated: ${results.length}`);
  console.log(`Failed: ${failed.length}`);
  process.exitCode = failed.length || ! results.length ? 1 : 0;
})();
