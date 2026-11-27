/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  ruleSelection.test.js
  Unit tests of the selection of testaro rules by a test act (selectRules in tests/testaro.ts). They need no browser. The validator validation/tests/jobProperties/ruleSelection.json checks valid selections in a real job; invalid ones are checked only here, because the validation harness does not evaluate the expectations of a prevented act.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const {selectRules} = require('../tests/testaro');

const defaultIDs = selectRules({}).ruleIDs;

test('with no rule properties, the default rules are selected', () => {
  const selection = selectRules({});
  assert.equal(selection.error, '');
  assert.ok(defaultIDs.length > 0);
  assert.ok(defaultIDs.includes('motion'));
  assert.ok(! defaultIDs.includes('textNodes'));
});

test('rules selects exactly the listed rules, in allRules order', () => {
  const selection = selectRules({rules: ['titledEl', 'adbID']});
  assert.deepEqual(selection.ruleIDs, ['adbID', 'titledEl']);
  assert.deepEqual(selection.warnings, []);
});

test('rules may select a rule that is off by default', () => {
  assert.deepEqual(selectRules({rules: ['textNodes']}).ruleIDs, ['textNodes']);
});

test('a leading y is accepted with a deprecation warning', () => {
  const selection = selectRules({rules: ['y', 'adbID']});
  assert.deepEqual(selection.ruleIDs, ['adbID']);
  assert.match(selection.warnings[0], /deprecated/);
});

test('a leading n excludes the listed rules from the defaults, with a deprecation warning', () => {
  const selection = selectRules({rules: ['n', 'motion', 'hover']});
  assert.deepEqual(selection.ruleIDs, defaultIDs.filter(id => ! ['motion', 'hover'].includes(id)));
  assert.match(selection.warnings[0], /rulesForcedOff/);
});

test('rulesForcedOn adds rules to the defaults', () => {
  const selection = selectRules({rulesForcedOn: ['textNodes']});
  assert.equal(selection.ruleIDs.length, defaultIDs.length + 1);
  assert.ok(selection.ruleIDs.includes('textNodes'));
});

test('rulesForcedOff removes rules from the defaults', () => {
  const selection = selectRules({rulesForcedOff: ['motion']});
  assert.deepEqual(selection.ruleIDs, defaultIDs.filter(id => id !== 'motion'));
});

test('rulesForcedOn and rulesForcedOff combine', () => {
  const selection = selectRules({rulesForcedOn: ['textNodes'], rulesForcedOff: ['motion']});
  assert.ok(selection.ruleIDs.includes('textNodes'));
  assert.ok(! selection.ruleIDs.includes('motion'));
});

test('forcing a default rule on, or a non-default rule off, changes nothing', () => {
  assert.deepEqual(selectRules({rulesForcedOn: ['motion'], rulesForcedOff: ['textNodes']}).ruleIDs, defaultIDs);
});

test('an unknown rule in rulesForcedOff is ignored with a warning', () => {
  const selection = selectRules({rulesForcedOff: ['shoot0', 'motion']});
  assert.equal(selection.error, '');
  assert.deepEqual(selection.ruleIDs, defaultIDs.filter(id => id !== 'motion'));
  assert.deepEqual(selection.unknownIDs, ['shoot0']);
  assert.match(selection.warnings[0], /shoot0/);
});

const invalidCases = [
  ['rules combined with rulesForcedOn', {rules: ['adbID'], rulesForcedOn: ['textNodes']}, /cannot be combined/],
  ['rules combined with rulesForcedOff', {rules: ['adbID'], rulesForcedOff: ['hover']}, /cannot be combined/],
  ['a rule forced both on and off', {rulesForcedOn: ['hover'], rulesForcedOff: ['hover']}, /both on and off: hover/],
  ['an unknown rule in rulesForcedOn', {rulesForcedOn: ['nope']}, /unknown rules: nope/],
  ['an unknown rule in rules', {rules: ['adbID', 'nope']}, /unknown rules: nope/],
  ['an unknown rule after a leading n', {rules: ['n', 'nope']}, /unknown rules: nope/],
  ['an empty rules', {rules: []}, /names no rules/],
  ['a leading y alone', {rules: ['y']}, /names no rules/]
];
for (const [label, act, pattern] of invalidCases) {
  test(`invalid: ${label}`, () => {
    const selection = selectRules(act);
    assert.match(selection.error, pattern);
    assert.deepEqual(selection.ruleIDs, []);
  });
}
