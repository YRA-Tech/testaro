/*
  © 2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  job
  Utilities about jobs and acts.
*/

// IMPORTS

// Requirements for acts.
const {actSpecs} = require('../actSpecs');
// Data on devices.
const {devices} = require('playwright');
// Module to get dates from time stamps.
const {dateOf} = require('./dateTime');

// CONSTANTS

// Names and descriptions of tools.
const tools = exports.tools = {
  alfa: 'Alfa',
  aslint: 'ASLint',
  axe: 'Axe',
  ed11y: 'Editoria11y',
  htmlcs: 'HTML CodeSniffer',
  ibm: 'Accessibility Checker',
  nuVal: 'Html Checker API',
  nuVnu: 'Html Checker',
  pour: 'Pour Engine',
  qualWeb: 'QualWeb',
  surea11y: 'SureA11y',
  testaro: 'Testaro',
  wave: 'WAVE',
};
/*
  What each tool tests: a live page (page), the live page's HTML (html), or only a URL (url).
  Tools that test a page or its HTML observe a checkpoint reached by interaction acts, because
  the test act's browser replays those acts; a tool that tests a URL can observe only a
  checkpoint reached by navigation.
*/
exports.toolInputs = {
  alfa: 'page',
  aslint: 'page',
  axe: 'page',
  ed11y: 'page',
  htmlcs: 'page',
  ibm: 'page',
  nuVal: 'html',
  nuVnu: 'html',
  pour: 'page',
  qualWeb: 'html',
  surea11y: 'page',
  testaro: 'page',
  wave: 'url'
};

// FUNCTIONS

// Validates a browser type.
const isBrowserID = exports.isBrowserID = type => ['chromium', 'firefox', 'webkit'].includes(type);
// Returns whether a variable has a specified type.
const hasType = (variable, type) => {
  if (type === 'string') {
    return typeof variable === 'string';
  }
  else if (type === 'array') {
    return Array.isArray(variable);
  }
  else if (type === 'boolean') {
    return typeof variable === 'boolean';
  }
  else if (type === 'number') {
    return typeof variable === 'number';
  }
  else if (type === 'object') {
    return typeof variable === 'object' && ! Array.isArray(variable);
  }
  else {
    return false;
  }
};
// Returns whether a variable has a specified subtype.
const hasSubtype = (variable, subtype) => {
  if (subtype) {
    if (subtype === 'hasLength') {
      return variable.length > 0;
    }
    else if (subtype === 'isURL') {
      return isURL(variable);
    }
    else if (subtype === 'isBrowserID') {
      return isBrowserID(variable);
    }
    else if (subtype === 'isFocusable') {
      return isFocusable(variable);
    }
    else if (subtype === 'isTest') {
      return tools[variable];
    }
    else if (subtype === 'isWaitable') {
      return ['url', 'title', 'body'].includes(variable);
    }
    else if (subtype === 'areNumbers') {
      return areNumbers(variable);
    }
    else if (subtype === 'areStrings') {
      return areStrings(variable);
    }
    else if (subtype === 'areArrays') {
      return areArrays(variable);
    }
    else if (subtype === 'isState') {
      return isState(variable);
    }
    else {
      console.log(`ERROR: ${subtype} not a known subtype`);
      return false;
    }
  }
  else {
    return true;
  }
};
// Validates a device ID.
const isDeviceID = exports.isDeviceID = deviceID => deviceID === 'default' || !! devices[deviceID];
// Validates a load state.
const isState = string => ['loaded', 'idle'].includes(string);
// Validates a URL.
const isURL = exports.isURL = string => /^(?:https?|file):\/\/[^\s]+$/.test(string);
// Validates a focusable tag name.
const isFocusable = string => ['a', 'button', 'input', 'select'].includes(string);
// Returns whether all elements of an array are numbers.
const areNumbers = array => array.every(element => typeof element === 'number');
// Returns whether all elements of an array are strings.
const areStrings = array => array.every(element => typeof element === 'string');
// Returns whether all properties of an object have array values.
const areArrays = object => Object.values(object).every(value => Array.isArray(value));
// Validates an act by reference to actSpecs.js.
const isValidAct = exports.isValidAct = act => {
  // Identify the type of the act.
  const type = act.type;
  // If the type exists and is known:
  if (type && actSpecs.etc[type]) {
    // Copy the validator of the type for possible expansion.
    const validator = Object.assign({}, actSpecs.etc[type][1]);
    // If the type is test:
    if (type === 'test') {
      // Identify the test.
      const toolID = act.which;
      // If one was specified and is known:
      if (toolID && tools[toolID]) {
        // If it has special properties:
        if (actSpecs.tools[toolID]) {
          // Expand the validator by adding them.
          Object.assign(validator, actSpecs.tools[toolID][1]);
        }
      }
      // Otherwise, i.e. if no or an unknown test was specified:
      else {
        // Return invalidity.
        return false;
      }
    }
    // Return whether the act is valid.
    return Object.keys(validator).every(property => {
      if (property === 'name') {
        return true;
      }
      else {
        const vP = validator[property];
        const aP = act[property];
        // If it is optional and omitted or is present and valid:
        const optAndNone = ! vP[0] && ! aP;
        const isValid = aP !== undefined && hasType(aP, vP[1]) && hasSubtype(aP, vP[2]);
        return optAndNone || isValid;
      }
    });
  }
  // Otherwise, i.e. if the act has an unknown or no type:
  else {
    // Return invalidity.
    return false;
  }
};
// Returns whether a job is valid and, if not, why not.
exports.isValidJob = job => {
  // If any job was provided:
  if (job) {
    // Get its properties.
    const {
      id,
      strict,
      standard,
      device,
      browserID,
      stealth,
      creationTimeStamp,
      executionTimeStamp,
      target,
      sources,
      acts,
      jobData
    } = job;
    // Return an error for the first missing or invalid property.
    if (! id || typeof id !== 'string') {
      return {
        isValid: false,
        error: 'Bad job ID'
      };
    }
    if (typeof strict !== 'boolean') {
      return {
        isValid: false,
        error: 'Bad job strict'
      };
    }
    if (! ['also', 'only', 'no'].includes(standard)) {
      return {
        isValid: false,
        error: 'Bad job standard'
      };
    }
    if (! isDeviceID(device.id)) {
      return {
        isValid: false,
        error: 'Bad job deviceID'
      };
    }
    if (! isBrowserID(browserID)) {
      return {
        isValid: false,
        error: 'Bad job browserID'
      };
    }
    // `stealth` is optional. When omitted, Testaro defaults to enabling the
    // puppeteer-extra-plugin-stealth evasions on Chromium (historical
    // behavior). When present, it must be a boolean.
    if (stealth !== undefined && typeof stealth !== 'boolean') {
      return {
        isValid: false,
        error: 'Bad job stealth (must be boolean if present)'
      };
    }
    if (
      ! (creationTimeStamp && typeof creationTimeStamp === 'string' && dateOf(creationTimeStamp))
    ) {
      return {
        isValid: false,
        error: 'Bad job creationTimeStamp'
      };
    }
    if (
      ! (executionTimeStamp && typeof executionTimeStamp === 'string' && dateOf(executionTimeStamp))
    ) {
      return {
        isValid: false,
        error: 'Bad job executionTimeStamp'
      };
    }
    if (typeof target !== 'object' || target.url && ! isURL(target.url) || target.what === '') {
      return {
        isValid: false,
        error: 'Bad job target'
      };
    }
    if (sources && typeof sources !== 'object') {
      return {
        isValid: false,
        error: 'Bad job sources'
      };
    }
    if (
      ! acts
      || ! Array.isArray(acts)
      || ! acts.length
      || ! acts.every(act => act.type && typeof act.type === 'string')
    ) {
      return {
        isValid: false,
        error: 'Bad job acts'
      };
    }
    const invalidAct = acts.find(act => ! isValidAct(act));
    if (invalidAct) {
      return {
        isValid: false,
        error: `Invalid act:\n${JSON.stringify(invalidAct, null, 2)}`
      };
    }
    // Checkpoint acts must be uniquely named and must follow a launch act.
    const checkpointNames = acts.filter(act => act.type === 'checkpoint').map(act => act.which);
    if (new Set(checkpointNames).size !== checkpointNames.length || checkpointNames.includes('start')) {
      return {
        isValid: false,
        error: 'Bad job checkpoint names (must be unique and not "start")'
      };
    }
    const firstCheckpointIndex = acts.findIndex(act => act.type === 'checkpoint');
    const firstLaunchIndex = acts.findIndex(act => act.type === 'launch');
    if (firstCheckpointIndex > -1 && (firstLaunchIndex === -1 || firstLaunchIndex > firstCheckpointIndex)) {
      return {
        isValid: false,
        error: 'Bad job acts (a checkpoint act precedes any launch act)'
      };
    }
    if (jobData && typeof jobData !== 'object') {
      return {
        isValid: false,
        error: 'Bad job jobData'
      };
    }
    return {
      isValid: true
    };
  }
  // Otherwise, i.e. if no job was provided:
  else {
    // Return this.
    return {
      isValid: false,
      error: 'No job'
    };
  }
};
