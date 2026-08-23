/*
  © 2022–2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  validateTest.js
  Validator for one Testaro test.
  Returns a result object, so callers can set an exit code, instead of only logging. Every way a
  validation can go wrong — a missing or malformed job-properties file, an aborted job, a prevented
  test act, a test act without expectations, an unsatisfied expectation, or a thrown error — is
  reported as a failure, so that no defect can be mistaken for a success.
*/

// IMPORTS

// Module to run Testaro jobs.
const {doJob} = require('../run');

// CONSTANTS

// Directory containing the job-properties file of each test.
const jobPropertiesDir = `${__dirname}/tests/jobProperties`;
/*
  Browser to validate with. WebKit is the default, because it is the strictest of the three
  Playwright browsers about the standards that many Testaro rules depend on. Overridable, because
  not every environment has every Playwright browser installed.
*/
const defaultBrowserID = process.env.TESTARO_VALIDATION_BROWSER || 'webkit';
// Whether to print the entire failing acts in addition to the failure summary.
const isVerbose = process.env.TESTARO_VALIDATION_VERBOSE === 'true';
// Format of the end time that a job is required to report.
const endTimePattern = /^(?:\d{2}-){2}\d{2}T\d{2}:\d{2}$/;

// FUNCTIONS

/*
  Returns a job for the validation of a test. A new object is returned on each call, so that no
  property set for one test (such as standard, timeLimit, or browserID) can leak into the next test
  when a caller validates several tests in one process.
*/
const getJob = () => ({
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
  browserID: defaultBrowserID,
  timeLimit: 0,
  creationTimeStamp: '250101T0000',
  executionTimeStamp: '250101T0000',
  sendReportTo: '',
  target: {
    what: 'page for test validation',
    url: ''
  },
  sources: {
    script: 'test',
    batch: 'test',
    mergeID: 'aaa',
    requester: ''
  },
  acts: []
});
// Returns the job properties of a test, or an error description.
const getJobProperties = testID => {
  // If the test ID could name a file outside the job-properties directory:
  if (! /^[A-Za-z0-9]+$/.test(testID || '')) {
    // Report this.
    return {error: `Test ID ${JSON.stringify(testID)} is missing or not alphanumeric`};
  }
  let jobProperties;
  try {
    jobProperties = require(`${jobPropertiesDir}/${testID}.json`);
  }
  catch(error) {
    // Only the first line, because a module-resolution error appends its entire require stack.
    const why = error.message.replace(/\n[\s\S]*$/, '');
    return {error: `No readable ${testID}.json in ${jobPropertiesDir} (${why})`};
  }
  // If it does not specify any acts:
  if (! Array.isArray(jobProperties.acts) || ! jobProperties.acts.length) {
    // Report this.
    return {error: `${testID}.json has no acts array`};
  }
  // If it specifies no test act:
  const testActs = jobProperties.acts.filter(act => act && act.type === 'test');
  if (! testActs.length) {
    // Report this.
    return {error: `${testID}.json has no test act`};
  }
  // If any test act states no expectation:
  if (testActs.some(act => ! Array.isArray(act.expect) || ! act.expect.length)) {
    // Report this, because such an act can never fail and so validates nothing.
    return {error: `${testID}.json has a test act without an expect array`};
  }
  return {jobProperties};
};
// Returns a one-line description of an unsatisfied expectation.
const failureLine = expectation => {
  const {property, relation, criterion, actual} = expectation;
  // An expectation of 1 item states that the property does not exist.
  const claim = relation === undefined
    ? `${property} does not exist`
    : `${property} ${relation} ${JSON.stringify(criterion)}`;
  return `expected ${claim}, but it is ${JSON.stringify(actual)}`;
};
/*
  Validates a Testaro test and returns {testID, passed, failures}. The failures are strings, each
  describing one reason why the validation did not succeed.
*/
const validateTest = async testID => {
  const failures = [];
  // Get the job properties of the test.
  const {jobProperties, error} = getJobProperties(testID);
  // If they are missing or invalid:
  if (error) {
    // Report this without running any job.
    failures.push(error);
    console.log(`Failure: ${error}`);
    return {testID, passed: false, failures};
  }
  // Use them to complete a job.
  const job = getJob();
  if (jobProperties.standard) {
    job.standard = jobProperties.standard;
  }
  if (jobProperties.browserID) {
    job.browserID = jobProperties.browserID;
  }
  if (typeof jobProperties.timeLimit === 'number') {
    job.timeLimit = jobProperties.timeLimit;
  }
  job.what = `validate Testaro test ${jobProperties.rule || testID}`;
  job.acts = jobProperties.acts;
  /*
    Make the target of the job the target of its first launch act. run.js catalogs job.target
    before any act runs, so a fixed target made the catalog describe one page, that of the adbID
    fixture, whatever page the acts then tested. Every XPath a rule reported therefore missed the
    path IDs of the catalog, and every standard instance got a synthetic catalog entry holding
    only a path ID and a tag name, instead of the text, ID, and box of the element.
  */
  const launchAct = jobProperties.acts.find(act => act.type === 'launch' && act.target);
  if (launchAct) {
    job.target = {... launchAct.target};
  }
  else {
    failures.push('No launch act with a target, so the catalog would describe no page');
    console.log(`Failure: ${failures[failures.length - 1]}`);
    return {testID, passed: false, failures};
  }
  let report;
  // Perform the job.
  try {
    report = await doJob(job);
  }
  // If performing it threw an error:
  catch(error) {
    // Report this as a failure, rather than letting it end the process.
    const message = `Job threw an error (${error.message})`;
    failures.push(message);
    console.log(`Failure: ${message}`);
    return {testID, passed: false, failures};
  }
  const {acts, jobData} = report;
  // If the job was aborted:
  if (! jobData || jobData.aborted) {
    // Report this, because its acts were not all performed.
    const why = jobData && jobData.abortMessage ? `: ${jobData.abortMessage}` : '';
    failures.push(`Job aborted${why}`);
  }
  // If the end time was not correctly reported:
  if (! jobData || ! endTimePattern.test(jobData.endTime || '')) {
    // Report this.
    failures.push('End time empty or invalid');
  }
  const testActs = (acts || []).filter(act => act && act.type === 'test');
  // If no test act was reported:
  if (! testActs.length) {
    // Report this, because otherwise a job that ran nothing would appear to succeed.
    failures.push('Report contains no test act');
  }
  // For each reported test act:
  testActs.forEach((act, index) => {
    const actID = `act ${index} (${act.which})`;
    // If the tool was prevented from testing:
    if (act.data && act.data.prevented) {
      // Report this, because its expectations were not evaluated.
      failures.push(`${actID}: tool prevented (${act.data.error || 'no error reported'})`);
    }
    // Otherwise, if its expectations were not evaluated:
    else if (act.expectationFailures === undefined) {
      // Report this.
      failures.push(`${actID}: expectations not evaluated`);
    }
    // Otherwise, if any of its expectations was not satisfied:
    else if (act.expectationFailures) {
      // Report each of them.
      (act.expectations || [])
      .filter(expectation => ! expectation.passed)
      .forEach(expectation => {
        failures.push(`${actID}: ${failureLine(expectation)}`);
      });
    }
  });
  const passed = ! failures.length;
  // Report the outcome.
  if (passed) {
    console.log(`######## Success: ${testID} satisfied all expectations\n`);
  }
  else {
    console.log(`######## Failure: ${testID} has ${failures.length} failure(s):`);
    failures.forEach(failure => {
      console.log(`  - ${failure}`);
    });
    console.log('');
    // If full acts were requested, print the ones that failed.
    if (isVerbose) {
      console.log(JSON.stringify(
        testActs.filter(act => act.expectationFailures || (act.data && act.data.prevented)), null, 2
      ));
    }
    else {
      console.log('Set TESTARO_VALIDATION_VERBOSE=true to print the failing acts in full.\n');
    }
  }
  return {testID, passed, failures};
};

// EXPORTS

exports.validateTest = validateTest;
