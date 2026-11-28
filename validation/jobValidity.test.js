/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  jobValidity.test.js
  Unit tests of the validation of jobs and acts (isValidJob and isValidAct in procs/job.ts). They need no browser. They cover the defects of #224: a wave act that set url was always invalid, a job with a null target or without a device made the validator throw, a job with an array as its target was valid, and an inherited property name such as constructor passed as an act type or a tool.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const {isValidAct, isValidJob} = require('../procs/job');

// Returns a minimal valid job.
const validJob = () => ({
  id: 'j1',
  strict: true,
  standard: 'only',
  device: {id: 'default'},
  browserID: 'chromium',
  creationTimeStamp: '261128T1200',
  executionTimeStamp: '261128T1200',
  target: {what: 'Example', url: 'https://example.com/'},
  sources: {},
  acts: [{type: 'launch', which: 'chromium', url: 'https://example.com/', what: 'Example'}]
});

test('the minimal job is valid', () => {
  assert.deepEqual(isValidJob(validJob()), {isValid: true});
});

test('a wave act may set url to a URL', () => {
  const act = {type: 'test', which: 'wave', reportType: 4};
  assert.equal(isValidAct(act), true);
  assert.equal(isValidAct({...act, url: 'https://wave.example.com'}), true);
});

test('a wave act may not set url to a non-URL', () => {
  const act = {type: 'test', which: 'wave', reportType: 4};
  assert.equal(isValidAct({...act, url: 'wave.example.com'}), false);
  assert.equal(isValidAct({...act, url: 42}), false);
});

test('a job with a null target is invalid, not an exception', () => {
  assert.deepEqual(isValidJob({...validJob(), target: null}), {isValid: false, error: 'Bad job target'});
});

test('a job with a target that is not an object is still invalid', () => {
  assert.deepEqual(isValidJob({...validJob(), target: 'https://example.com/'}), {isValid: false, error: 'Bad job target'});
});

test('a job with an array as its target is invalid', () => {
  assert.deepEqual(isValidJob({...validJob(), target: []}), {isValid: false, error: 'Bad job target'});
  assert.deepEqual(isValidJob({...validJob(), target: [{what: 'Example', url: 'https://example.com/'}]}), {isValid: false, error: 'Bad job target'});
});

test('a job without a device or with a null device is invalid, not an exception', () => {
  const job = validJob();
  delete job.device;
  assert.deepEqual(isValidJob(job), {isValid: false, error: 'Bad job deviceID'});
  assert.deepEqual(isValidJob({...validJob(), device: null}), {isValid: false, error: 'Bad job deviceID'});
});

test('an inherited property name is not an act type', () => {
  for (const type of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    assert.equal(isValidAct({type}), false, type);
  }
});

test('a job whose act has an inherited name as its type is invalid', () => {
  const validity = isValidJob({...validJob(), acts: [{type: 'constructor'}]});
  assert.equal(validity.isValid, false);
  assert.match(validity.error, /Invalid act/);
});

test('an inherited property name is not a tool', () => {
  for (const which of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
    assert.equal(isValidAct({type: 'test', which}), false, which);
  }
});

test('a known act type and a known tool are still valid', () => {
  assert.equal(isValidAct({type: 'wait', what: 'body', which: 'text'}), true);
  assert.equal(isValidAct({type: 'test', which: 'axe', detailLevel: 2}), true);
});
