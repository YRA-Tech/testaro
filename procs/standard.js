/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  standard
  Utilities for building standard results.

  A standard result has these properties:
    prevented: whether the rule engine was prevented from performing the act
    totals: array of 4 integers, counting instances at ordinal severities 0 through 3
    outcomeTotals: object counting instances by outcome ({failed, cantTell})
    instances: array of standard instances

  A standard instance has these properties:
    ruleID: ID of the violated rule
    what: description of the rule or of the violation
    ordinalSeverity: severity of the violation (0 to 3)
    outcome: 'failed' if the rule engine asserted a violation, or 'cantTell' if it reported that it could not determine whether the rule was violated (ACT Rules Format vocabulary)
    uncertainty?: reason for a cantTell outcome, if the rule engine gave one (one of UNCERTAINTY_CODES)
    needed?: what a reviewer must determine to resolve a cantTell outcome, if the rule engine said
    count: how many violations of the rule the instance reports
    catalogIndex?: key of the violating element in the catalog
    pathID?: normalized XPath of the violating element, if it has no catalog index

  The outcome is the authoritative certainty signal. Until ordinalSeverity is redefined as impact only, each tool's ordinalSeverity conventions are unchanged, so consumers must not infer certainty from ordinalSeverity.
*/

// ########## CONSTANTS

// Outcomes of instances.
exports.OUTCOMES = ['failed', 'cantTell'];
// Reasons for cantTell outcomes.
exports.UNCERTAINTY_CODES = [
  'not-computable',
  'judgement-required',
  'runtime-dependent',
  'spec-only',
  'equivalence-unknown',
  'out-of-scope'
];
// Maximum length of a needed description.
const NEEDED_MAX_LENGTH = 300;

// ########## FUNCTIONS

// Returns an empty standard result.
exports.getStandardResult = () => ({
  prevented: false,
  totals: [0, 0, 0, 0],
  outcomeTotals: {failed: 0, cantTell: 0},
  instances: []
});
// Returns a standard instance, validating its certainty properties.
exports.getInstance = spec => {
  const {
    ruleID, what, ordinalSeverity, outcome = 'failed', uncertainty, needed, count = 1, catalogIndex, pathID
  } = spec;
  if (! exports.OUTCOMES.includes(outcome)) {
    throw new Error(`Invalid outcome ${outcome} for rule ${ruleID}`);
  }
  const instance = {
    ruleID,
    what,
    ordinalSeverity: Number(ordinalSeverity),
    outcome
  };
  // If the outcome is cantTell, add any reason and reviewer guidance.
  if (outcome === 'cantTell') {
    if (uncertainty) {
      if (! exports.UNCERTAINTY_CODES.includes(uncertainty)) {
        throw new Error(`Invalid uncertainty ${uncertainty} for rule ${ruleID}`);
      }
      instance.uncertainty = uncertainty;
    }
    if (needed) {
      instance.needed = String(needed).replace(/\s+/g, ' ').trim().slice(0, NEEDED_MAX_LENGTH);
    }
  }
  instance.count = count;
  if (catalogIndex !== undefined) {
    instance.catalogIndex = catalogIndex;
  }
  else if (pathID) {
    instance.pathID = pathID;
  }
  return instance;
};
// Adds an instance to a standard result and increments its outcome total.
exports.pushInstance = (standardResult, spec) => {
  const instance = exports.getInstance(spec);
  standardResult.outcomeTotals ??= {failed: 0, cantTell: 0};
  standardResult.outcomeTotals[instance.outcome] += instance.count;
  standardResult.instances.push(instance);
  return instance;
};
// Adds an instance to a standard result and increments its severity and outcome totals.
exports.addInstance = (standardResult, spec) => {
  const instance = exports.pushInstance(standardResult, spec);
  standardResult.totals[instance.ordinalSeverity] += instance.count;
  return instance;
};
