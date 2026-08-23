/*
  © 2022–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  run.js
  Validator for immediate job execution.
  Exits with status 0 only if the job ran and reported everything the validator requires.
*/

// IMPORTS

const fs = require('fs/promises');

// CONSTANTS

const {doJob} = require('../../run');
const jobID = '240101T1200-simple-example';

// OPERATION

(async () => {
  const failures = [];
  try {
    // Get the simple job.
    const jobJSON = await fs.readFile(`${__dirname}/../jobs/todo/${jobID}.json`, 'utf8');
    const job = JSON.parse(jobJSON);
    // Run it.
    const report = await doJob(job);
    // Check the report against expectations.
    const {acts, jobData} = report;
    if (! Array.isArray(acts) || acts.length !== 2) {
      failures.push(`Count of acts is ${Array.isArray(acts) ? acts.length : 'undefined'}, not 2`);
    }
    if (! jobData) {
      failures.push('Report omits jobData');
    }
    else {
      if (jobData.aborted) {
        failures.push(`Job aborted (${jobData.abortMessage || 'no message'})`);
      }
      if (! jobData.startTime || ! jobData.endTime) {
        failures.push('Report omits a start time or an end time');
      }
      else if (jobData.endTime < jobData.startTime) {
        failures.push('End time precedes start time');
      }
    }
  }
  catch(error) {
    failures.push(`Threw an error (${error.message})`);
  }
  if (failures.length) {
    failures.forEach(failure => {
      console.log(`Failure: ${failure}`);
    });
    process.exitCode = 1;
  }
  else {
    console.log('Success');
    process.exitCode = 0;
  }
})();
