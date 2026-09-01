/*
  © 2022–2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  validateTest.js
  Validator for one Testaro test.
*/

// IMPORTS

// Module to run Testaro jobs.
const {doJob} = require('../run');

// CONSTANTS
const jobTemplate = {
  id: '250101T0000-aaa-00',
  what: '',
  strict: true,
  standard: 'only',
  device: {
    id: 'default',
    windowOptions: {
      reducedMotion: 'no-preference'
    }
  },
  browserID: 'webkit',
  timeLimit: 0,
  creationTimeStamp: '250101T0000',
  executionTimeStamp: '250101T0000',
  sendReportTo: '',
  target: {
    what: 'page for test validation',
    url: 'file://validation/tests/targets/adbID/index.html'
  },
  sources: {
    script: 'test',
    batch: 'test',
    mergeID: 'aaa',
    requester: ''
  },
  acts: []
};

// FUNCTIONS

// Validates a Testaro test and returns a result summary.
exports.validateTest = async testID => {
  // Get data for a job for the test.
  const jobProperties = require(`./tests/jobProperties/${testID}.json`);
  // Use the data to complete a copy of the job template, so jobs cannot contaminate each other.
  const job = structuredClone(jobTemplate);
  if (jobProperties.standard) {
    job.standard = jobProperties.standard;
  }
  // Rules that compare a page with its catalog image (motion) need one to be made.
  if (jobProperties.imageColor !== undefined) {
    job.imageColor = jobProperties.imageColor;
  }
  job.what = `validate Testaro test ${jobProperties.rule}`;
  job.acts = jobProperties.acts;
  /*
    Make the job target the page that the job launches. The catalog, and the page
    image that the motion rule compares its own screenshot with, are made on the
    job target before the first act, so leaving the target at its default made
    every validation catalog a catalog of an unrelated page.
  */
  const launchAct = jobProperties.acts.find(act => act.type === 'launch');
  if (launchAct && launchAct.target && launchAct.target.url) {
    job.target = {
      what: launchAct.target.what || 'page for test validation',
      url: launchAct.target.url
    };
  }
  // Initialize the failure descriptions.
  const failures = [];
  // Perform the job.
  const report = await doJob(job);
  // Report whether the end time was reported.
  const {acts, jobData} = report;
  if (jobData.endTime && /^(?:\d{2}-){2}\d{2}T\d{2}:\d{2}$/.test(jobData.endTime)) {
    console.log('Success: End time has been correctly populated');
  }
  else {
    console.log('Failure: End time empty or invalid');
    failures.push('End time empty or invalid');
  }
  // If the test acts were correctly reported:
  const testActs = acts.filter(act => act.type && act.type === 'test');
  if (
    testActs.length === report.acts.filter(act => act.type === 'test').length
    && testActs.every(
      testAct => testAct.expectationFailures !== undefined
    )
  ) {
    // Report this.
    console.log('Success: Reports have been correctly populated');
    // If all expectations were satisfied:
    if (testActs.every(testAct => testAct.expectationFailures === 0)) {
      // Report this.
      console.log('######## Success: No failures\n');
    }
    // Otherwise, i.e. if not all expectations were satisfied:
    else {
      // Report this.
      console.log(
        '######## Failure: The test has at least one failure (see “"passed": false” below)\n'
      );
      failures.push('At least one expectation was not satisfied');
      // Output the acts that had failures.
      console.log(
        JSON.stringify(
          acts.filter(act => act.type === 'test' && act.expectationFailures), null, 2
        )
      );
    }
  }
  else {
    console.log('Failure: Act results empty or invalid');
    failures.push('Act results empty or invalid');
    console.log(JSON.stringify(acts, null, 2));
  }
  // Return the result summary.
  return {
    testID,
    success: ! failures.length,
    failures
  };
};
