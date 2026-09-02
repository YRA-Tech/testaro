/*
  © 2021–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Page} from 'playwright';
import {getAttributeXPath, getXPathCatalogIndex} from '../procs/xPath';
import {getStandardResult, pushInstance} from '../procs/standard';
import type {Act, Report, StandardInstance, StandardResult} from '../types';
const accessibilityChecker = require('accessibility-checker') as typeof import('accessibility-checker');
const {getCompliance} = accessibilityChecker;

// TYPES

// The ibm-act properties this reporter consumes.
interface IbmAct extends Act {
  withItems?: boolean;
  rules?: string[];
}
// One item (rule violation) of an IBM act report.
interface IbmItem {
  ruleId: string;
  level: string;
  message: string;
  snippet: string;
  apiArgs?: unknown;
  category?: unknown;
  ignored?: unknown;
  messageArgs?: unknown;
  reasonId?: unknown;
  ruleTime?: unknown;
  value?: unknown;
}
// The violation totals of an IBM act report.
interface IbmCounts {
  violation: number;
  recommendation: number;
  [key: string]: number;
}
// An IBM act report before trimming.
interface IbmActReport {
  summary?: {counts?: IbmCounts};
  results: IbmItem[];
  items?: IbmItem[];
}
// An IBM act report after trimming: results, or an error.
type IbmTrimmedReport =
  | {totals: IbmCounts; items: IbmItem[] | undefined; error?: undefined}
  | {totals: null; items: IbmItem[]; error: string};

/*
  ibm
  Implements the IBM Equal Access ruleset for accessibility.

  This rule engine depends on aceconfig.js.

  This rule engine is compatible with Windows only if the accessibility-checker package
  is revised. See README.md for details.
  Compiled to ibm.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

// Runs the IBM test and returns the result.
const run = async (content: Page) => {
  const nowLabel = (new Date()).toISOString().slice(0, 19);
  try {
    const ibmReport = await getCompliance(content, nowLabel);
    if (typeof ibmReport === 'object' && ibmReport.report) {
      return ibmReport as unknown as {report: IbmActReport};
    }
    else {
      return {
        prevented: true,
        error: 'ibm getCompliance produced no report'
      };
    }
  }
  catch(error) {
    console.log('ibm getCompliance failed');
    return {
      prevented: true,
      error: (error as Error).message.slice(0, 200)
    };
  }
};
// Revises act-report totals for any rule limitation.
const limitRuleTotals = (actReport: IbmActReport, rules: string[] | undefined) => {
  if (rules && Array.isArray(rules) && rules.length) {
    const totals = actReport.summary!.counts!;
    const items = actReport.results;
    totals.violation = totals.recommendation = 0;
    items.forEach(item => {
      if (rules.includes(item.ruleId)) {
        totals[item.level]++;
      }
    });
  }
};
// Trims an IBM report.
const trimActReport = (
  actReport: IbmActReport | undefined, withItems: boolean | undefined, rules: string[] | undefined
): IbmTrimmedReport => {
  // If the act report includes a summary:
  if (actReport && actReport.summary) {
    // Remove excluded rules from the act report.
    limitRuleTotals(actReport, rules);
    const totals = actReport.summary.counts;
    // If the act report includes totals:
    if (totals) {
      // If itemization is required:
      if (withItems) {
        // Trim the items.
        if (rules && Array.isArray(rules) && rules.length) {
          actReport.items = actReport.results.filter(item => rules.includes(item.ruleId));
        }
        else {
          actReport.items = actReport.results;
        }
        actReport.items.forEach(item => {
          delete item.apiArgs;
          delete item.category;
          delete item.ignored;
          delete item.messageArgs;
          delete item.reasonId;
          delete item.ruleTime;
          delete item.value;
        });
      }
      // Return the act report, trimmed.
      return {
        totals,
        items: actReport.items
      };
    }
    // Otherwise, i.e. if it excludes totals:
    else {
      // Return an act report with this error.
      return {
        totals: null,
        items: [],
        error: 'No totals reported'
      };
    }
  }
  // Otherwise, i.e. if it excludes a summary:
  else {
    // Return an act report with this error.
    return {
      totals: null,
      items: [],
      error: 'No summary reported'
    };
  }
};
// Conducts and reports the IBM Equal Access tests.
export const reporter = async (page: Page, report: Report, actIndex: number) => {
  const act = report.acts[actIndex] as IbmAct;
  const {withItems, rules} = act;
  // Initialize the act report.
  const result: {nativeResult: IbmTrimmedReport | Record<string, never>; standardResult: StandardResult} = {
    nativeResult: {},
    standardResult: {}
  };
  const standard = report.standard !== 'no';
  // If standard results are to be reported:
  if (standard) {
    // Initialize the standard result.
    result.standardResult = getStandardResult();
  }
  try {
    // Conduct the tests.
    const runReport = await run(page);
    const actReport = (runReport as {report?: IbmActReport}).report;
    // If there were results:
    if (actReport) {
      // Trim them.
      result.nativeResult = trimActReport(actReport, withItems, rules);
      const {nativeResult, standardResult} = result as
        {nativeResult: IbmTrimmedReport; standardResult: StandardResult};
      const {error, totals} = nativeResult;
      // If they were not trimmable:
      if (error) {
        // Return an act report with this error.
        return {
          data: {
            prevented: true,
            error
          },
          result: {}
        }
      }
      // Otherwise, i.e. if they were trimmable, and if standard results are to be reported:
      if (standard) {
        // Populate the totals of the standard result.
        standardResult.totals = [totals!.recommendation, 0, totals!.violation, 0];
        // For each item of the native result (without itemization, items is
        // undefined and this throws, caught below; verbatim from the original):
        nativeResult.items!.forEach(item => {
          // Populate a standard instance. Potential violations, potential recommendations, and
          // manual checks are engine-flagged uncertainty.
          const standardItem: StandardInstance = {
            ruleID: item.ruleId,
            what: item.message,
            ordinalSeverity: item.level === 'recommendation' ? 0 : 2,
            outcome: ['violation', 'recommendation'].includes(item.level) ? 'failed' : 'cantTell'
          };
          // Get the XPath from the added attribute, because path.dom is wrong.
          const xPath = getAttributeXPath(item.snippet);
          // If the XPath was obtained:
          if (xPath) {
            // Add the catalog index to the standard instance.
            standardItem.catalogIndex = getXPathCatalogIndex(report, xPath);
          }
          // Add the standard instance to the standard result.
          pushInstance(standardResult, standardItem);
        });
      }
      return {
        data: {},
        result
      };
    }
    // Otherwise, i.e. if there was only an error, return it in an act report.
    return {
      data: runReport,
      result: {}
    }
  }
  // If an error occurred:
  catch(error) {
    const message = `Act failed (${(error as Error).message.slice(0, 200)})`;
    console.log(message);
    // Return it in an act report.
    return {
      data: {
        prevented: true,
        error: message
      },
      result: {}
    };
  }
};
