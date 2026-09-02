"use strict";
/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.addInstance = exports.pushInstance = exports.getInstance = exports.getStandardResult = exports.UNCERTAINTY_CODES = exports.OUTCOMES = void 0;
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
const getStandardResult = () => ({
    prevented: false,
    totals: [0, 0, 0, 0],
    outcomeTotals: { failed: 0, cantTell: 0 },
    instances: []
});
exports.getStandardResult = getStandardResult;
// Returns a standard instance, validating its certainty properties.
const getInstance = (spec) => {
    const { ruleID, what, ordinalSeverity, outcome = 'failed', uncertainty, needed, count = 1, catalogIndex, pathID } = spec;
    if (!exports.OUTCOMES.includes(outcome)) {
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
            if (!exports.UNCERTAINTY_CODES.includes(uncertainty)) {
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
exports.getInstance = getInstance;
// Adds an instance to a standard result and increments its outcome total.
const pushInstance = (standardResult, spec) => {
    const instance = (0, exports.getInstance)(spec);
    standardResult.outcomeTotals ??= { failed: 0, cantTell: 0 };
    standardResult.outcomeTotals[instance.outcome] += instance.count;
    standardResult.instances.push(instance);
    return instance;
};
exports.pushInstance = pushInstance;
// Adds an instance to a standard result and increments its severity and outcome totals.
const addInstance = (standardResult, spec) => {
    const instance = (0, exports.pushInstance)(standardResult, spec);
    standardResult.totals[instance.ordinalSeverity] += instance.count;
    return instance;
};
exports.addInstance = addInstance;
