/*
  © 2023–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// ########## IMPORTS

// Function to get a catalog index from an XPath.
import {getXPathCatalogIndex} from './xPath';
import type {Locator, Page} from 'playwright';
import type {GetBadWhat, Report, SeverityTotals, StandardInstance} from '../types';

/*
  testaro
  Utilities for Testaro tests. Compiled to testaro.js by tsc (issue #73); edit
  this file, not the emitted one.
*/

// ########## TYPES

// A violation found in the page before it becomes a standard instance.
interface ProtoInstance {
  what: string;
  ordinalSeverity: number;
  xPath: string;
}
// What doTest and getBasicResult return to the calling rule module.
export interface RuleResult {
  data: Record<string, unknown>;
  totals: SeverityTotals;
  standardInstances: StandardInstance[];
}
// A violation reported by a doTest-ineligible rule module.
interface BasicViolation {
  loc: Locator;
  what: string;
}

// ########## FUNCTIONS

// Tests for a testaro rule.
export const doTest = async (
  page: Page,
  report: Report,
  withItems: boolean,
  ruleID: string,
  candidateSelector: string,
  whats: string,
  severity: number,
  getBadWhatString: string
): Promise<RuleResult> => {
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
    const protoInstances: ProtoInstance[] = [];
    /*
      Parse the supplied string to get the classifier. The predicate travels as
      source text (serialized with toString() by the rule module) because it
      must run inside the page; this cast is the single point where its type is
      asserted rather than checked (issue #73, RFC decision 4). The eval input
      is first-party rule-module source from this repository, never target-page
      or user data; replacing the eval pipeline with a bundled artifact is the
      Phase 3 reassessment recorded on issue #73.
    */
    const getBadWhat = eval(`(${getBadWhatString})`) as GetBadWhat;
    // Initialize data on the rule.
    let data: Record<string, unknown> = {};
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
          ruleWhat = (violationWhat as {description: string; data?: unknown}).description;
          data[violationCount - 1] = (violationWhat as {description: string; data?: unknown}).data;
        }
        // Otherwise, i.e. if only a description of the violation was provided:
        else if (violationType === 'string') {
          // Get it.
          ruleWhat = violationWhat as string;
        }
        // A predicate that returns a truthy non-object non-string would make this throw,
        // exactly as in the JavaScript original.
        const ruleWhatStart = (ruleWhat as string).slice(0, 2);
        let ordinalSeverity = severity;
        // If this violation has a custom severity:
        if (/[0-3]:/.test(ruleWhatStart)) {
          // Get it.
          ordinalSeverity = Number((ruleWhat as string)[0]);
          // Remove it from the violation description.
          ruleWhat = (ruleWhat as string).slice(2);
        }
        // Increment the applicable rule-violation total.
        totals[ordinalSeverity]++;
        // If itemization is required:
        if (withItems) {
          const protoInstance = {
            what: ruleWhat as string,
            ordinalSeverity,
            xPath: window.getXPath(candidate as Element) ?? '/html'
          };
          // Add a proto-instance to the proto-instances.
          protoInstances.push(protoInstance);
        }
      }
    }
    return {
      data,
      totals,
      protoInstances
    }
  }, [
      withItems,
      candidateSelector,
      severity,
      getBadWhatString
    ] as const
  );
  // Initialize the standard instances.
  let standardInstances: StandardInstance[] = [];
  const {data, totals, protoInstances} = ruleData;
  // If itemization is required:
  if (withItems) {
    // For each proto-instance:
    protoInstances.forEach(protoInstance => {
      const {what, ordinalSeverity, xPath} = protoInstance;
      // Initialize a standard instance.
      const standardInstance: StandardInstance = {
        ruleID,
        what,
        ordinalSeverity: ordinalSeverity as StandardInstance['ordinalSeverity'],
        count: 1
      };
      // If the proto-instance includes an XPath:
      if (xPath) {
        // Add the catalog index to the standard instance.
        standardInstance.catalogIndex = getXPathCatalogIndex(report, xPath);
      }
      // Add the standard instance to the standard instances.
      standardInstances.push(standardInstance);
    });
  }
  // Otherwise, i.e. if itemization is not required:
  else {
    // For each ordinal severity:
    for (const index in totals) {
      // If there were any violations at that severity:
      if (totals[index as unknown as number]) {
        // Add a summary standard instance to the standard instances.
        standardInstances.push({
          ruleID,
          what: whats,
          // Numeric, not the for...in string index, so summary instances match
          // itemized instances and validator expectations (issue #99).
          ordinalSeverity: Number(index) as StandardInstance['ordinalSeverity'],
          count: totals[index as unknown as number]
        });
      }
    }
  }
  // Return the data, totals, and standard instances.
  return {
    data,
    totals: totals as SeverityTotals,
    standardInstances
  };
};
// Adds a catalog index or, if necessary, an XPath to a proto-instance.
const addCatalogIndex = async (
  protoInstance: StandardInstance, locator: Locator, report: Report
): Promise<StandardInstance> => {
  // Get the XPath of the element referenced by the locator.
  const xPath = await locator.evaluate(element => window.getXPath(element) ?? '/html');
  // Add a catalog index to the proto-instance.
  protoInstance.catalogIndex = getXPathCatalogIndex(report, xPath);
  // Return the proto-instance with any modification.
  return protoInstance;
};
// Tests for a doTest-ineligible Testaro rule.
export const getBasicResult = async (
  report: Report,
  withItems: boolean,
  ruleID: string,
  ordinalSeverity: StandardInstance['ordinalSeverity'],
  whats: string,
  data: {prevented?: boolean; [key: string]: unknown},
  violations: BasicViolation[]
): Promise<RuleResult> => {
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
  const totals: SeverityTotals = [0, 0, 0, 0];
  totals[ordinalSeverity] = violations.length;
  const standardInstances: StandardInstance[] = [];
  // If itemization is required:
  if (withItems) {
    // For each violation:
    for (const violation of violations) {
      const {loc, what} = violation;
      // Initialize a standard instance.
      const protoInstance: StandardInstance = {
        ruleID,
        what,
        ordinalSeverity,
        count: 1
      };
      // Add a catalog index to it, awaited so the index is present before the
      // report can be serialized (issue #100).
      await addCatalogIndex(protoInstance, loc, report);
      // Add the standard instance to the standard instances.
      standardInstances.push(protoInstance);
    }
  }
  // Otherwise, i.e. if itemization is not required:
  else {
    // Add a summary instance to the instances.
    standardInstances.push({
      ruleID,
      what: whats,
      ordinalSeverity,
      count: violations.length
    });
  }
  // Return the result.
  return {
    data,
    totals,
    standardInstances
  };
};
