/*
  © 2022–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  dirWatch.js
  Validator for directory watching.
  Exits with status 0 only if the watch found the job that this validator makes available, performed
  it, and ended without a failure. A deadline turns a hang, which used to stall the validator
  indefinitely, into a failure.
*/

// IMPORTS

const fs = require('fs/promises');

// CONSTANTS

// Override dirWatch environment variables with validation-specific ones.
process.env.JOBDIR = `${__dirname}/../watch`;
process.env.REPORTDIR = `${__dirname}/../../temp`;
const jobID = '240101T1200-simple-example';
const {dirWatch} = require('../../dirWatch');
const todoPath = `${process.env.JOBDIR}/todo/${jobID}.json`;
// Deadline, so that a watch that never finds or never finishes the job fails instead of stalling.
const timeLimitInSeconds = Number(process.env.TESTARO_VALIDATION_TIMELIMIT) || 600;

// FUNCTIONS

// Removes the job that this validator made available, if the watch did not archive it.
const clean = async () => {
  try {
    await fs.rm(todoPath, {force: true});
  }
  catch(error) {
    console.log(`ERROR: Could not remove ${todoPath} (${error.message})`);
  }
};

// OPERATION

const watchdog = setTimeout(async () => {
  console.log(`Failure: Watch validation did not end within ${timeLimitInSeconds} seconds`);
  await clean();
  process.exit(1);
}, 1000 * timeLimitInSeconds);
// Start checking for jobs every 5 seconds.
dirWatch(false, 5)
.then(async isOK => {
  clearTimeout(watchdog);
  await clean();
  // The report that the watch was to write.
  let isReported = false;
  try {
    await fs.access(`${process.env.REPORTDIR}/raw/${jobID}.json`);
    isReported = true;
  }
  catch {
    console.log(`Failure: No report ${jobID}.json in ${process.env.REPORTDIR}/raw`);
  }
  if (isOK && isReported) {
    console.log('Success: Watch validation ended');
    process.exitCode = 0;
  }
  else {
    console.log('Failure: Watch validation ended with a failure');
    process.exitCode = 1;
  }
})
.catch(async error => {
  clearTimeout(watchdog);
  await clean();
  console.log(`Failure: Watch validation threw an error (${error.message})`);
  process.exitCode = 1;
});
// Make a job available after 7 seconds.
setTimeout(async () => {
  try {
    await fs.mkdir(`${process.env.JOBDIR}/todo`, {recursive: true});
    await fs.copyFile(`${__dirname}/../jobs/todo/${jobID}.json`, todoPath);
    console.log('Job made available after 7 seconds');
  }
  catch(error) {
    console.log(`ERROR: Could not make the job available (${error.message})`);
  }
}, 7000);
