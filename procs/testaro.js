/*
  © 2023–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  testaro
  Utilities for Testaro tests.
*/

// ########## IMPORTS

// Function to get a catalog index from an XPath.
const {getXPathCatalogIndex} = require('./xPath');
// Function to build a standard instance.
const {getInstance} = require('./standard');

// ########## FUNCTIONS

// Returns a standard instance, leaving the outcome unset if the violation did not specify one, so
// that the testaro tool can apply the rule's default outcome.
const getRuleInstance = spec => {
  const instance = getInstance(spec);
  if (! spec.outcome) {
    instance.outcome = undefined;
  }
  return instance;
};

// Tests for a testaro rule.
exports.doTest = async (
  page,
  report,
  withItems,
  ruleID,
  candidateSelector,
  whats,
  severity,
  getBadWhatString
) => {
  const ruleData = await page.evaluate(async args => {
    // Get the arguments.
    const [
      withItems,
      candidateSelector,
      severity,
      getBadWhatString
    ] = args;
    // Get all violator candidates.
    const candidates = document.querySelectorAll(candidateSelector);
    let violationCount = 0;
    // Initialize proto-instances.
    const protoInstances = [];
    // Initialize counts of cantTell violations by ordinal severity, for summary instances.
    const cantTellTotals = [0, 0, 0, 0];
    // Parse the supplied string to get the classifier.
    const getBadWhat = eval(`(${getBadWhatString})`);
    // Initialize data on the rule.
    let data = {};
    const totals = [0, 0, 0, 0];
    // For each candidate:
    for (const candidate of candidates) {
      // Classify it as and get a violation description if a violator or undefined if not.
      const violationWhat = await getBadWhat(candidate);
      // If the candidate violates the rule:
      if (violationWhat) {
        // Increment the violation count.
        violationCount++;
        let ruleWhat;
        const violationType = typeof violationWhat;
        // If data on the violation were provided (unusual):
        if (violationType === 'object') {
          // Get the description and add the data to the rule data.
          ruleWhat = violationWhat.description;
          data[violationCount - 1] = violationWhat.data;
        }
        // Otherwise, i.e. if only a description of the violation was provided:
        else if (violationType === 'string') {
          // Get it.
          ruleWhat = violationWhat;
        }
        let ordinalSeverity = severity;
        let outcome;
        // If this violation has a custom severity or outcome prefix (e.g. 2:, 2?:, or ?:):
        const prefixMatch = ruleWhat.match(/^([0-3])?(\?)?:/);
        if (prefixMatch) {
          // If the prefix has a severity, get it.
          if (prefixMatch[1]) {
            ordinalSeverity = Number(prefixMatch[1]);
          }
          // If the prefix marks the violation as uncertain, record this.
          if (prefixMatch[2]) {
            outcome = 'cantTell';
            cantTellTotals[ordinalSeverity]++;
          }
          // Remove the prefix from the violation description.
          ruleWhat = ruleWhat.slice(prefixMatch[0].length);
        }
        // Increment the applicable rule-violation total.
        totals[ordinalSeverity]++;
        // If itemization is required:
        if (withItems) {
          const protoInstance = {
            what: ruleWhat,
            ordinalSeverity,
            outcome,
            xPath: window.getXPath(candidate) ?? '/html'
          };
          // Add a proto-instance to the proto-instances.
          protoInstances.push(protoInstance);
        }
      }
    }
    return {
      data,
      totals,
      cantTellTotals,
      protoInstances
    };
  }, [
    withItems,
    candidateSelector,
    severity,
    getBadWhatString
  ]
  );
  // Initialize the standard instances. Any instance without an outcome gets the rule's default
  // outcome from the testaro tool.
  let standardInstances = [];
  const {data, totals, cantTellTotals, protoInstances} = ruleData;
  // If itemization is required:
  if (withItems) {
    // For each proto-instance:
    protoInstances.forEach(protoInstance => {
      const {what, ordinalSeverity, outcome, xPath} = protoInstance;
      // Add a standard instance to the standard instances.
      standardInstances.push(getRuleInstance({
        ruleID,
        what,
        ordinalSeverity,
        outcome,
        catalogIndex: xPath ? getXPathCatalogIndex(report, xPath) : undefined
      }));
    });
  }
  // Otherwise, i.e. if itemization is not required:
  else {
    // For each ordinal severity:
    totals.forEach((total, ordinalSeverity) => {
      const cantTellTotal = cantTellTotals[ordinalSeverity];
      // If there were any asserted violations at that severity:
      if (total - cantTellTotal) {
        // Add a summary standard instance to the standard instances.
        standardInstances.push(getRuleInstance({
          ruleID,
          what: whats,
          ordinalSeverity,
          count: total - cantTellTotal
        }));
      }
      // If there were any uncertain violations at that severity:
      if (cantTellTotal) {
        // Add a summary standard instance for them.
        standardInstances.push(getRuleInstance({
          ruleID,
          what: whats,
          ordinalSeverity,
          outcome: 'cantTell',
          count: cantTellTotal
        }));
      }
    });
  }
  // Return the data, totals, and standard instances.
  return {
    data,
    totals,
    standardInstances
  };
};
// Adds a catalog index or, if necessary, an XPath to a proto-instance.
const addCatalogIndex = async (protoInstance, locator, report) => {
  // Get the XPath of the element referenced by the locator.
  const xPath = await locator.evaluate(element => window.getXPath(element) ?? '/html');
  // Add a catalog index to the proto-instance.
  protoInstance.catalogIndex = getXPathCatalogIndex(report, xPath);
  // Return the proto-instance with any modification.
  return protoInstance;
};
// Tests for a doTest-ineligible Testaro rule.
exports.getBasicResult = async (
  report, withItems, ruleID, ordinalSeverity, whats, data, violations
) => {
  // If the test was prevented:
  if (data.prevented) {
    // Return this.
    return {
      data,
      totals: [0, 0, 0, 0],
      standardInstances: []
    };
  }
  // Otherwise, i.e. if the test was not prevented:
  const totals = [0, 0, 0, 0];
  totals[ordinalSeverity] = violations.length;
  const standardInstances = [];
  // If itemization is required:
  if (withItems) {
    // For each violation:
    for (const violation of violations) {
      // A violation may specify its own outcome, uncertainty, and needed guidance.
      const {loc, what, outcome, uncertainty, needed} = violation;
      // Initialize a standard instance.
      const protoInstance = getRuleInstance({
        ruleID,
        what,
        ordinalSeverity,
        outcome,
        uncertainty,
        needed
      });
      // Add a catalog index to it.
      await addCatalogIndex(protoInstance, loc, report);
      // Add the standard instance to the standard instances.
      standardInstances.push(protoInstance);
    }
  }
  // Otherwise, i.e. if itemization is not required:
  else {
    // Add a summary instance per outcome to the instances.
    const outcomeCounts = {};
    violations.forEach(violation => {
      const outcome = violation.outcome || 'failed';
      outcomeCounts[outcome] = (outcomeCounts[outcome] || 0) + 1;
    });
    Object.keys(outcomeCounts).forEach(outcome => {
      standardInstances.push(getRuleInstance({
        ruleID,
        what: whats,
        ordinalSeverity,
        outcome,
        count: outcomeCounts[outcome]
      }));
    });
  }
  // Return the result.
  return {
    data,
    totals,
    standardInstances
  };
};
