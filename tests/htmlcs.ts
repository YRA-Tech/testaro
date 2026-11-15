/*
  © 2022–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import * as fs from 'fs/promises';
import type {Page} from 'playwright';
import {getAttributeXPath, getXPathCatalogIndex} from '../procs/xPath';
import {getStandardResult, pushInstance} from '../procs/standard';
import type {Act, Report, StandardInstance, StandardResult} from '../types';

// TYPES

// The htmlcs-act properties this reporter consumes.
interface HtmlcsAct extends Act {
  rules?: string[];
}
// The native result: violation totals and the parts of error and warning messages.
interface HtmlcsNativeResult {
  totals: {
    failed: number;
    cantTell: number;
  };
  error: string[][];
  warning: string[][];
}

/*
  htmlcs
  Implements the HTML CodeSniffer ruleset.
  Compiled to htmlcs.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

// Conducts and reports the HTML CodeSniffer tests.
export const reporter = async (page: Page, report: Report, actIndex: number) => {
  const act = report.acts[actIndex] as HtmlcsAct;
  const {rules} = act;
  // Initialize the act report.
  const data: {prevented?: boolean; error?: string} = {};
  const result: {nativeResult: HtmlcsNativeResult; standardResult: StandardResult} = {
    nativeResult: {
      totals: {
        failed: 0,
        cantTell: 0
      },
      error: [],
      warning: []
    },
    standardResult: {}
  };
  const standard = report.standard !== 'no';
  // If standard results are to be reported:
  if (standard) {
    // Initialize the standard result.
    result.standardResult = getStandardResult();
  }
  const {nativeResult, standardResult} = result;
  // Get the HTMLCS script.
  const scriptText = await fs.readFile(`${__dirname}/../htmlcs/HTMLCS.js`, 'utf8');
  /*
    HTMLCS.js is a UMD bundle. If the page exposes an AMD loader (define.amd, e.g. Wix or RequireJS) or leaked CommonJS globals (exports, module), the UMD wrapper registers HTMLCS as a module and never attaches HTMLCS_RUNNER to window, so the run() call below throws and the tool is reported prevented. So those loader globals are hidden while the script runs, making the wrapper fall through to its browser-global branch, and then restored.
  */
  const hideLoaders = 'window.__testaroUMD = {define: window.define, exports: window.exports, module: window.module};'
  + ' window.define = window.exports = window.module = undefined;';
  const restoreLoaders = 'if (window.__testaroUMD) {window.define = window.__testaroUMD.define;'
  + ' window.exports = window.__testaroUMD.exports; window.module = window.__testaroUMD.module;'
  + ' delete window.__testaroUMD;}';
  let messageStrings: string[] = [];
  // For each class of standards to  be tested for:
  for (const actStandard of ['WCAG2AAA']) {
    try {
      /*
        Run the HTMLCS script in the page. A script element would be refused by a page whose
        content security policy forbids inline scripts, so the script is instead evaluated in
        the page, which no such policy prevents.
      */
      await page.evaluate(`${hideLoaders}\n${scriptText}\n;${restoreLoaders}\nvoid 0;`);
    }
    // If the script failed to run:
    catch(error) {
      console.log(`ERROR running the HTMLCS script (${(error as Error).message.slice(0, 200)})`);
      // Ensure the loader globals are restored. The run() call below will fail and be reported.
      await page.evaluate(`${restoreLoaders}\nvoid 0;`).catch(() => {});
    }
    const nextViolations = await page.evaluate(args => {
      const actStandard = args[0] as string;
      const rules = args[1] as string[] | undefined;
      // If only some rules are to be employed:
      if (rules && Array.isArray(rules) && rules.length) {
        // Redefine WCAG 2 AAA as including only them.
        if (! window.HTMLCS_WCAG2AAA) {
          window.HTMLCS_WCAG2AAA = {};
        }
        window.HTMLCS_WCAG2AAA.sniffs = rules;
      }
      let violations: string[] | null = null;
      // Run the tests.
      try {
        violations = window.HTMLCS_RUNNER!.run(actStandard);
      }
      catch(error) {
        console.log(`ERROR executing HTMLCS_RUNNER on ${document.URL} (${(error as Error).message})`);
      }
      // Return the reported violations of that standard.
      return violations;
    }, [actStandard, rules]);
    // If all reported violations of the standard are validly described:
    if (nextViolations?.every(violation => typeof violation === 'string')) {
      // Add their descriptions to the violation descriptions.
      messageStrings.push(... nextViolations);
    }
    // Otherwise, i.e. if any reported violations are invalidly described:
    else {
      // Report this.
      data.prevented = true;
      data.error = 'ERROR executing HTMLCS_RUNNER in the page';
      break;
    }
  }
  // If no error was thrown:
  if (! data.prevented) {
    // Sort the violations by class and standard.
    messageStrings.sort();
    // Remove any duplicate violations.
    messageStrings = [... new Set(messageStrings)];
    // For each violation:
    for (const string of messageStrings) {
      // Split its message into severity class, rule ID, tagname, ID, rule description, and excerpt.
      const parts = string.split(/\|/, 6);
      const partCount = parts.length;
      // If the message partitions are too few:
      if (partCount < 6) {
        // Report this.
        console.log(`ERROR: Violation string ${string} has too few parts`);
      }
      // Otherwise, if the message reports an error:
      else if (parts[0] === 'Error') {
        // Add the rest of its message to the native-result errors.
        nativeResult.error.push(parts.slice(1));
        // Increment the error total.
        nativeResult.totals.failed++;
      }
      // Otherwise, if the message reports a warning:
      else if (parts[0] === 'Warning') {
        // Add the rest of its message to the native-result warnings.
        nativeResult.warning.push(parts.slice(1));
        // Increment the warning total.
        nativeResult.totals.cantTell++;
      }
      // If standard results are to be reported and the message reports an error or warning:
      if (standard && ['Error', 'Warning'].includes(parts[0])) {
        const xPath = getAttributeXPath(parts[5]);
        pushInstance(standardResult, {
          ruleID: `${parts[0][0]}-${parts[1]}`,
          what: parts[4],
          ordinalSeverity: parts[0] === 'Warning' ? 0 : 2,
          outcome: parts[0] === 'Warning' ? 'cantTell' : 'failed',
          catalogIndex: getXPathCatalogIndex(report, xPath)
        });
      }
    }
    // If standard results are to be reported:
    if (standard) {
      // Populate the standard-result totals.
      standardResult.totals![0] = nativeResult.totals.cantTell;
      standardResult.totals![2] = nativeResult.totals.failed;
    }
  }
  return {
    data,
    result
  };
};
