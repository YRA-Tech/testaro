/*
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  checkFixtures.js
  Static checker of the validation fixtures.
  Runs no browser and performs no job, so it is fast and deterministic enough to gate every commit.
  It catches the defects that a browser-based validation reports only obscurely, or not at all: a
  job-properties file that names a nonexistent rule, a target URL whose file is absent or differs in
  case, an expectation whose operator the evaluator does not implement, and a rule with no fixture.
*/

// IMPORTS

const fs = require('fs');
const {allRules} = require('../tests/testaro');

// CONSTANTS

const jobPropertiesDir = `${__dirname}/tests/jobProperties`;
const projectDir = `${__dirname}/..`;
// Operators that isTrue() in procs/doActs.js implements.
const operators = ['<', '=', '>', '!', 'i', '!i', 'e'];
/*
  Properties that a standard instance no longer has. It identifies the element it reports by a
  catalogIndex into the catalog of the report, so an expectation about the element reads it through
  a catalogEntry segment. An expectation naming one of these is always unsatisfied, and, before the
  validators reported failures, that was invisible.
*/
const goneInstanceProperties = /instances\.\d+\.(tagName|excerpt|id|location)\b/;

// FUNCTIONS

// Returns the file-system path that a target URL of a job act refers to.
const pathOfURL = url => url.replace(/^file:\/\//, `${projectDir}/`);
/*
  Returns whether a path exists, comparing the case of every segment. fs.existsSync alone would
  accept a wrong case on a case-insensitive file system, letting a fixture that works on macOS or
  Windows fail on the Linux runner that performs the continuous integration.
*/
const existsExactly = path => {
  if (! fs.existsSync(path)) {
    return false;
  }
  const segments = path.split('/').filter(segment => segment.length);
  let soFar = '';
  for (const segment of segments) {
    // A . or .. segment names no file, so accept it and continue.
    if (segment === '.' || segment === '..') {
      soFar += `/${segment}`;
      continue;
    }
    let entries;
    try {
      entries = fs.readdirSync(soFar || '/');
    }
    catch {
      return false;
    }
    if (! entries.includes(segment)) {
      return false;
    }
    soFar += `/${segment}`;
  }
  return true;
};
// Returns the target URLs that an act refers to.
const urlsOfAct = act => {
  const urls = [];
  if (act.target && act.target.url) {
    urls.push(act.target.url);
  }
  if (act.type === 'url' && act.which) {
    urls.push(act.which);
  }
  return urls.filter(url => url.startsWith('file://'));
};
// Checks one job-properties file and adds any defects to an array of errors.
const checkFixture = (fileName, ruleIDs, errors) => {
  const testID = fileName.replace(/\.json$/, '');
  const at = `${fileName}`;
  let jobProperties;
  try {
    jobProperties = JSON.parse(fs.readFileSync(`${jobPropertiesDir}/${fileName}`, 'utf8'));
  }
  catch(error) {
    errors.push(`${at}: not parsable as JSON (${error.message})`);
    return null;
  }
  // The file name identifies the rule to “npm test”, so a differing rule property misleads.
  if (jobProperties.rule !== testID) {
    errors.push(`${at}: rule property is ${JSON.stringify(jobProperties.rule)}, not "${testID}"`);
  }
  // A fixture for an unregistered rule is never run and cannot pass.
  if (! ruleIDs.includes(testID)) {
    errors.push(`${at}: ${testID} is not a rule in the registry in tests/testaro.js`);
  }
  if (! Array.isArray(jobProperties.acts) || ! jobProperties.acts.length) {
    errors.push(`${at}: has no acts array`);
    return testID;
  }
  const testActs = jobProperties.acts.filter(act => act && act.type === 'test');
  if (! testActs.length) {
    errors.push(`${at}: has no test act`);
  }
  // For each act:
  jobProperties.acts.forEach((act, index) => {
    const actAt = `${at} act ${index}`;
    // Check that every local target it refers to exists.
    urlsOfAct(act).forEach(url => {
      if (! existsExactly(pathOfURL(url))) {
        errors.push(`${actAt}: target ${url} does not exist (check the spelling and the case)`);
      }
    });
    // If it is a test act:
    if (act.type === 'test') {
      // Check that the rules it names are registered.
      if (Array.isArray(act.rules)) {
        act.rules.slice(1).forEach(ruleID => {
          if (! ruleIDs.includes(ruleID)) {
            errors.push(`${actAt}: names unregistered rule ${ruleID}`);
          }
        });
      }
      // Check that it states expectations, since otherwise it can never fail.
      if (! Array.isArray(act.expect) || ! act.expect.length) {
        errors.push(`${actAt}: has no expect array`);
      }
      // Check that each expectation is one the evaluator can evaluate.
      else {
        act.expect.forEach((spec, specIndex) => {
          const specAt = `${actAt} expectation ${specIndex}`;
          if (! Array.isArray(spec) || ! [1, 3].includes(spec.length)) {
            errors.push(`${specAt}: is not an array of 1 or 3 items`);
            return;
          }
          if (typeof spec[0] !== 'string' || ! spec[0].length) {
            errors.push(`${specAt}: first item is not a nonempty property path`);
          }
          else if (goneInstanceProperties.test(spec[0])) {
            errors.push(
              `${specAt}: ${spec[0]} names a property that a standard instance no longer has; `
              + 'state the fact about the element through catalogEntry, such as '
              + 'instances.0.catalogEntry.tagName or instances.0.catalogEntry.box.height'
            );
          }
          if (spec.length === 3 && ! operators.includes(spec[1])) {
            errors.push(`${specAt}: operator ${JSON.stringify(spec[1])} is not one of ${
              operators.map(operator => `"${operator}"`).join(', ')
            }`);
          }
        });
      }
    }
  });
  return testID;
};
/*
  Checks all the validation fixtures and returns {errors, warnings}. An error is a defect that makes
  a fixture wrong. A warning is a gap in coverage, which is a backlog item rather than a defect.
*/
const checkFixtures = () => {
  const errors = [];
  const warnings = [];
  const ruleIDs = allRules.map(rule => rule.id);
  let fileNames;
  try {
    fileNames = fs.readdirSync(jobPropertiesDir).filter(fileName => fileName.endsWith('.json'));
  }
  catch(error) {
    return {errors: [`Cannot read ${jobPropertiesDir} (${error.message})`], warnings};
  }
  if (! fileNames.length) {
    return {errors: [`No job-properties files in ${jobPropertiesDir}`], warnings};
  }
  const testIDs = fileNames.map(fileName => checkFixture(fileName, ruleIDs, errors));
  // Report each registered rule that no fixture validates.
  ruleIDs.filter(ruleID => ! testIDs.includes(ruleID)).forEach(ruleID => {
    warnings.push(`Rule ${ruleID} has no fixture in ${jobPropertiesDir.replace(projectDir, '.')}`);
  });
  return {errors, warnings, fixtureCount: fileNames.length, ruleCount: ruleIDs.length};
};

// EXPORTS

exports.checkFixtures = checkFixtures;
