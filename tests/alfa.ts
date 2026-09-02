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
import {getNormalizedXPath, getXPathCatalogIndex} from '../procs/xPath';
import {getStandardResult, addInstance} from '../procs/standard';
import {applyMultiplier} from '../procs/config';
import type {Act, Report, StandardInstance, StandardResult} from '../types';
/*
  The alfa packages are pure ESM that Node loads via require(esm); their own
  types do not resolve under this project's node10 module resolution, so the
  imports stay requires and are untyped.
*/
let alfaRules = require('@siteimprove/alfa-rules').default;
const {Audit} = require('@siteimprove/alfa-act');
const {Playwright} = require('@siteimprove/alfa-playwright');

// TYPES

// The alfa-act properties this reporter consumes.
interface AlfaAct extends Act {
  rules?: string[];
}
// One evaluation of the audit, before JSON conversion.
interface AlfaEvaluation {
  target?: {
    _members?: unknown;
    toString: () => string;
    path: () => string;
  };
  toJSON: () => AlfaEvalItem;
}
// One element-specific item converted from an evaluation.
interface AlfaEvalItem {
  diagnostic?: {
    errors?: {
      element?: unknown;
      positionedDescendants?: unknown;
    }[];
  };
  expectations?: {
    error?: {
      message?: string;
    };
  }[][];
  outcome: string;
  rule: {
    requirements?: {title?: string}[];
    uri: string;
  };
  target?: {children?: unknown};
  code?: string;
  path?: string;
}
// The native result: violation totals and element-specific items.
interface AlfaNativeResult {
  totals: {
    failed: number;
    cantTell: number;
  };
  items: AlfaEvalItem[];
}

/*
  alfa
  Implements the alfa ruleset for accessibility.
  Compiled to alfa.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

// Conducts and reports the alfa tests.
export const reporter = async (page: Page, report: Report, actIndex: number) => {
  const act = report.acts[actIndex] as AlfaAct;
  const {rules} = act;
  // If only some rules are to be employed:
  if (rules && rules.length) {
    // Remove the other rules.
    alfaRules = alfaRules.filter(
      (rule: {uri: string}) => rules.includes(rule.uri.replace(/^.+-/, ''))
    );
  }
  // Initialize the act report.
  const data: {prevented?: boolean; error?: string} = {};
  const result: {nativeResult: AlfaNativeResult; standardResult: StandardResult} = {
    nativeResult: {
      totals: {
        failed: 0,
        cantTell: 0
      },
      items: []
    },
    standardResult: {}
  };
  const standard = report.standard !== 'no';
  // If standard results are to be reported:
  if (standard) {
    // Initialize the standard result.
    result.standardResult = getStandardResult();
  }
  try {
    try {
      // Wait for a stable page to make the page and its alfa version consistent.
      await page.waitForLoadState('networkidle', {timeout: applyMultiplier(9000)});
    }
    // If that fails:
    catch (error) {
      // Wait for the page to be loaded.
      await page.waitForLoadState('domcontentloaded', {timeout: applyMultiplier(6000)});
    }
    const doc = await page.evaluateHandle('document');
    const alfaPage = await Playwright.toPage(doc);
    // Test the page content with the specified rules.
    const audit = Audit.of(alfaPage, alfaRules);
    // Get the evaluations.
    const evaluations: AlfaEvaluation[] = Array.from(await audit.evaluate());
    const {nativeResult, standardResult} = result;
    // For each of them:
    for (const index in evaluations) {
      const evaluation = evaluations[index as unknown as number];
      const targetClass = evaluation.target;
      // If it has a non-collection violator:
      if (targetClass && ! targetClass._members) {
        // Convert the evaluation to an element-specific item.
        const item = evaluation.toJSON();
        const {diagnostic, expectations, outcome, rule, target} = item;
        // If the outcome of the item is a failure or warning:
        if (['failed', 'cantTell'].includes(outcome)) {
          // Delete typically massive properties unlikely to be useful.
          delete target!.children;
          if (diagnostic?.errors) {
            diagnostic.errors.forEach(error => {
              delete error.element;
              delete error.positionedDescendants;
            });
          }
          // Increment the applicable total.
          nativeResult.totals[outcome as 'failed' | 'cantTell']++;
          const codeLines = targetClass.toString().split('\n');
          if (codeLines[0] === '#document') {
            codeLines.splice(2, codeLines.length - 3, ' … ');
          }
          else if (codeLines[0].startsWith('<html')) {
            codeLines.splice(1, codeLines.length - 2, ' … ');
          }
          let code = codeLines.join('/n');
          if (code.length > 400) {
            code = `${code.slice(0, 300)} … ${code.slice(-100)}`;
          }
          // Add properties of the evaluation to the item.
          item.code = code;
          item.path = targetClass.path();
          // Add the item to the items of the native result.
          nativeResult.items.push(item);
          // If standard results are to be reported:
          if (standard) {
            const {requirements, uri} = rule;
            // Get the rule ID of the item.
            const ruleID = uri.replace(/^.+-/, '');
            // Get the rule description of the item.
            let what = (expectations?.[0]?.[1]?.error?.message || '').trim().replace(/\s+/g, ' ');
            if (! what) {
              if (requirements && requirements.length && requirements[0].title) {
                what = requirements[0].title;
              }
            }
            // An untestable item keeps its rule ID; its outcome records the uncertainty. The
            // contrast rules (r66, r69) cannot tell when a background needs human judgement.
            const isCantTell = outcome === 'cantTell';
            const xPath = getNormalizedXPath(item.path?.replace(/\/text\(\).*$/, '') || '/html');
            // Add an instance to the standard instances.
            addInstance(standardResult, {
              ruleID,
              what,
              ordinalSeverity: isCantTell ? 0 : 2,
              outcome: isCantTell ? 'cantTell' : 'failed',
              uncertainty: isCantTell && ['r66', 'r69'].includes(ruleID)
                ? 'judgement-required'
                : undefined,
              catalogIndex: getXPathCatalogIndex(report, xPath)
            });
          }
        }
      }
    };
  }
  catch(error) {
    data.prevented = true;
    const {message} = error as Error;
    if (message) {
      if (message.includes('Unsupported node of type: 4')) {
        data.error = 'Alfa cannot test page because it contains CDATA';
      }
      else {
        data.error = message;
      }
    }
    console.log(`ERROR: ${data.error}`);
  }
  return {
    data,
    result
  };
};
