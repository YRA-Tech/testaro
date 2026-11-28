/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  isTrue.test.js
  Unit tests of the evaluation of expectations and next-act conditions (isTrue in procs/doActs.ts). They need no browser. They cover #228: an expectation of the empty property path made the act part of its own expectations, so the report could not be serialized, and a missing object or a property path that is not a string made isTrue throw. The validator validation/tests/jobProperties/nextAct.json checks next acts in a real job.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const {isTrue} = require('../procs/doActs');

const act = {type: 'test', which: 'testaro', result: {standardResult: {totals: [0, 1, 0, 0]}}};

test('a property path is evaluated against the object, or its result', () => {
  assert.deepEqual(isTrue(act, ['which', '=', 'testaro']), ['testaro', true]);
  assert.deepEqual(isTrue(act, ['standardResult.totals.1', '>', 0]), [1, true]);
  assert.deepEqual(isTrue(act, ['standardResult.totals.1', '=', 0]), [1, false]);
});

test('a one-part expectation is that the property does not exist', () => {
  assert.deepEqual(isTrue(act, ['nonexistent']), [undefined, true]);
  assert.deepEqual(isTrue(act, ['which']), ['testaro', false]);
});

test('an empty property path is unfulfilled, and its actual value is not the object', () => {
  assert.deepEqual(isTrue(act, ['']), [null, false]);
  assert.deepEqual(isTrue(act, ['', '=', 'x']), [null, false]);
});

test('an expectation of the empty property path leaves the act serializable', () => {
  const copy = structuredClone(act);
  const truth = isTrue(copy, ['']);
  copy.expectations = [{property: '', actual: truth[0], passed: truth[1]}];
  assert.doesNotThrow(() => JSON.stringify(copy));
});

test('a property path that is not a string is unfulfilled, not an exception', () => {
  for (const property of [undefined, null, 5, ['which'], {}]) {
    assert.deepEqual(isTrue(act, [property]), [null, false], String(property));
  }
});

test('an undefined object has no properties', () => {
  assert.deepEqual(isTrue(undefined, ['standardResult.prevented', '=', false]), [null, false]);
  assert.deepEqual(isTrue(undefined, ['standardResult']), [undefined, true]);
});
