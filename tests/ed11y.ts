/*
  © 2023–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import * as fs from 'fs/promises';
import type {Page} from 'playwright';
import {getXPathCatalogIndex} from '../procs/xPath';
import {getStandardResult, pushInstance} from '../procs/standard';
import type {Act, Report, SeverityTotals, StandardInstance, StandardResult} from '../types';

// TYPES

// The ed11y-act properties this reporter consumes.
interface Ed11yAct extends Act {
  rules?: string[];
}
// One test result exposed by the Ed11y global.
interface Ed11yToolResult {
  test: string;
  content: string;
  dismissalKey: string;
  element: Element;
}
// One instance of the native result.
interface Ed11yNativeInstance {
  test: string;
  content: string;
  dismissalKey: string;
  html: string;
  xPath: string | null | undefined;
}
// The native result: totals and instances, or a prevention report.
interface Ed11yNativeResult {
  resultCount?: number;
  errorCount?: number;
  warningCount?: number;
  results?: Ed11yNativeInstance[];
  prevented?: boolean;
  error?: string;
}

/*
  The Ed11y global that the tool script defines in the page: a constructor whose
  test results are exposed as static properties. Declared without a value, so
  this declaration is erased at emit and the references inside the page.evaluate
  callback remain bare page-global references.
*/
declare const Ed11y: {
  new (options: {alertMode: string}): unknown;
  results: Ed11yToolResult[];
  errorCount: number;
  warningCount: number;
};

/*
  ed11y
  Implements the Editoria11y ruleset for accessibility.
  Compiled to ed11y.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

// Performs and reports the Editoria11y tests.
export const reporter = async (page: Page, report: Report, actIndex: number) => {
  // Get the nonce, if any.
  const act = report.acts[actIndex] as Ed11yAct;
  const {jobData} = report;
  const scriptNonce = (jobData && jobData.lastScriptNonce) as string | undefined;
  // Initialize the act report.
  let data: {prevented?: boolean; error?: string} = {};
  const result: {nativeResult: Ed11yNativeResult; standardResult: StandardResult} = {
    nativeResult: {},
    standardResult: {}
  };
  const standard = report.standard !== 'no';
  // If standard results are to be reported:
  if (standard) {
    // Initialize the standard result.
    result.standardResult = getStandardResult();
  }
  // Get the tool script.
  const script = await fs.readFile(`${__dirname}/../ed11y/editoria11y.min.js`, 'utf8');
  // Perform the specified tests and populate the native result.
  result.nativeResult = await page.evaluate(args => new Promise<Ed11yNativeResult>(
    async resolve => {
      const {scriptNonce, script, rulesToTest} = args;
      // When the script has been executed, creating data in an Ed11y object:
      document.addEventListener('ed11yResults', async () => {
        let {results} = Ed11y;
        // If rules were selected:
        if (rulesToTest) {
          // Remove results of other rules.
          results = results.filter(result => rulesToTest.includes(result.test));
        }
        // Return the native result.
        resolve({
          resultCount: results.length,
          errorCount: Ed11y.errorCount,
          warningCount: Ed11y.warningCount,
          results: results.map(result => ({
            test: result.test,
            content: result.content.replace(/\s+/g, ' ').trim(),
            dismissalKey: result.dismissalKey,
            html: result.element.outerHTML.slice(0, 500),
            xPath: window.getXPath(result.element)
          }))
        });
      });
      // Add the tool script to the page.
      const toolScript = document.createElement('script');
      if (scriptNonce) {
        toolScript.nonce = scriptNonce;
        console.log(`Added nonce ${scriptNonce} to tool script`);
      }
      toolScript.textContent = script;
      document.body.insertAdjacentElement('beforeend', toolScript);
      // Execute the tool script, creating Ed11y and triggering the event listener.
      try {
        await new Ed11y({
          alertMode: 'headless'
        });
      }
      catch(error) {
        resolve({
          prevented: true,
          error: (error as Error).message
        });
      };
    }
  ), {
    scriptNonce,
    script,
    rulesToTest: act.rules
  });
  // If the tool script failed to run:
  if (result.nativeResult.prevented) {
    // Report the prevention.
    data.prevented = true;
    data.error = result.nativeResult.error as string;
    if (standard) {
      result.standardResult.prevented = true;
    }
  }
  // Otherwise, i.e. if it ran, and if a standard result is to be reported:
  else if (standard) {
    const {standardResult} = result;
    const {warningCount, errorCount, results} = result.nativeResult as Required<Ed11yNativeResult>;
    // Populate the standard-result totals.
    standardResult.totals = [warningCount, 0, errorCount, 0] as SeverityTotals;
    // For each native-result instance:
    results.forEach(nativeInstance => {
      // Create a standard-result instance.
      const {test, content, dismissalKey, xPath} = nativeInstance;
      // A dismissable warning is a manual check.
      pushInstance(standardResult, {
        ruleID: test,
        what: content,
        ordinalSeverity: dismissalKey ? 0 : 2,
        outcome: dismissalKey ? 'cantTell' : 'failed',
        uncertainty: dismissalKey ? 'judgement-required' : undefined,
        catalogIndex: getXPathCatalogIndex(report, xPath as string)
      });
    });
  }
  return {
    data,
    result
  };
};
