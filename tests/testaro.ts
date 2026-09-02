/*
  © 2023–2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  testaro
  Implements the Testaro evaluative rules.
*/

// IMPORTS

// Shared configuration for timeout multiplier.
import type {Page} from 'playwright';
import {applyMultiplier} from '../procs/config';
import {browserClose, launch} from '../procs/launch';
// Function to get an empty standard result.
import {getStandardResult} from '../procs/standard';
import {ruleModules} from '../testaro/registry';
import type {RuleID, RuleModule} from '../testaro/registry';
import type {Act, BrowserID, Outcome, Report, StandardInstance, UncertaintyCode} from '../types';

// TYPES

// Metadata of one rule.
interface RuleMeta {
  id: RuleID;
  what: string;
  contaminates: boolean;
  needsAccessibleName: boolean;
  // Default outcome of the rule's violations ('failed' unless specified): 'cantTell' for a
  // heuristic rule whose violations need human confirmation; a violation may override it.
  outcome?: Outcome;
  // Default uncertainty code of the rule's cantTell violations.
  uncertainty?: UncertaintyCode;
  // Whether the rule's verdict on an element depends only on that element's subtree and
  // what it references, so a changed-scope test act may restrict the rule to changed subtrees.
  // Page-level rules (heading order, landmarks, duplicate IDs, focus order, hover, motion, …)
  // are not local: any change can alter their verdicts, so they always test the whole page.
  local: boolean;
  timeOut: number;
  defaultOn: boolean;
  // Read below but defined by no rule, so the temporary-directory branch never runs;
  // verbatim from the original.
  needsTmpDir?: boolean;
}
// The testaro-act properties this reporter consumes.
interface TestaroAct extends Act {
  target?: {url: string; what?: string};
  args?: Record<string, unknown[]>;
  stopOnFail?: boolean;
  withItems?: boolean;
  rules?: string[];
  launch?: {browserID?: BrowserID};
  scope?: 'page' | 'changed';
}
// The result of one rule test.
interface RuleTestResult {
  id: RuleID;
  prevented: boolean;
  error: string;
  data: unknown;
  totals: number[];
  instances: StandardInstance[];
  elapsedTime: number;
}

// CONSTANTS

// Metadata of all rules in default execution order.
const allRules: RuleMeta[] = [
  {
    id: 'adbID',
    what: 'elements with ambiguous or missing referenced descriptions',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'allCapStyle',
    what: 'elements with all-capital text transformation styles',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: false
  },
  {
    id: 'allCaps',
    what: 'elements with unnecessarily all-capital text substrings',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    outcome: 'cantTell',
    uncertainty: 'judgement-required',
    timeOut: 30,
    defaultOn: true
  },
  {
    id: 'allHidden',
    what: 'page that is entirely or mostly hidden',
    contaminates: false,
    needsAccessibleName: false,
    local: false,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'allSlanted',
    what: 'leaf elements with entirely italic or oblique text longer than 39 characters',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'altScheme',
    what: 'img elements with alt attributes having URLs as their entire values',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'attVal',
    what: 'elements with attributes having illicit values',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: false
  },
  {
    id: 'bulk',
    what: 'large count of visible elements',
    contaminates: false,
    needsAccessibleName: false,
    local: false,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'captionLoc',
    what: 'caption elements that are not first children of table elements',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'datalistRef',
    what: 'elements with ambiguous or missing referenced datalist elements',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'distortion',
    what: 'distorted text',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'docType',
    what: 'document without a doctype property',
    contaminates: false,
    needsAccessibleName: false,
    local: false,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'embAc',
    what: 'active elements embedded in links or buttons',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'headEl',
    what: 'invalid elements within the head',
    contaminates: false,
    needsAccessibleName: false,
    local: false,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'headingAmb',
    what: 'same-level sibling headings with identical texts',
    contaminates: false,
    needsAccessibleName: false,
    local: false,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'hr',
    what: 'hr element instead of styles used for vertical segmentation',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'imageLink',
    what: 'links with image files as their destinations',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'labClash',
    what: 'labeling inconsistencies',
    contaminates: false,
    needsAccessibleName: false,
    local: false,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'legendLoc',
    what: 'legend elements that are not first children of fieldset elements',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'lineHeight',
    what: 'text with a line height less than 1.5 times its font size',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'linkAmb',
    what: 'links with identical texts but different destinations',
    contaminates: false,
    needsAccessibleName: false,
    local: false,
    timeOut: 20,
    defaultOn: true
  },
  {
    id: 'linkExt',
    what: 'links that automatically open new windows',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'linkOldAtt',
    what: 'links with deprecated attributes',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'linkTo',
    what: 'links without destinations',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'linkUl',
    what: 'missing underlines on inline links',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'miniText',
    what: 'text smaller than 11 pixels',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'nonTable',
    what: 'table elements used for layout',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'optRoleSel',
    what: 'Non-option elements with option roles that have no aria-selected attributes',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'pseudoP',
    what: 'adjacent br elements suspected of nonsemantically simulating p elements',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'radioSet',
    what: 'radio buttons not grouped into standard field sets',
    contaminates: false,
    needsAccessibleName: false,
    local: false,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'role',
    what: 'native-replacing explicit roles',
    contaminates: false,
    needsAccessibleName: false,
    local: false,
    timeOut: 20,
    defaultOn: true
  },
  {
    id: 'secHeading',
    what: 'headings that violate the logical level order in their sectioning containers',
    contaminates: false,
    needsAccessibleName: false,
    local: false,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'styleDiff',
    what: 'style inconsistencies',
    contaminates: false,
    needsAccessibleName: false,
    local: false,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'targetsNear',
    what: 'labels, buttons, inputs, and links too near each other',
    contaminates: false,
    needsAccessibleName: false,
    local: false,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'textSem',
    what: 'semantically vague elements i, b, and/or small',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'title',
    what: 'page title',
    contaminates: false,
    needsAccessibleName: false,
    local: false,
    timeOut: 5,
    defaultOn: false
  },
  {
    id: 'titledEl',
    what: 'title attributes on inappropriate elements',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'zIndex',
    what: 'non-default Z indexes',
    contaminates: false,
    needsAccessibleName: false,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'motion',
    what: 'motion without user request',
    contaminates: false,
    needsAccessibleName: false,
    local: false,
    // The budget must cover a full-page screenshot (itself allowed 4 seconds in
    // procs/shoot.js), decoding two full-page PNGs, and a pixel comparison; 5
    // seconds made the rule time out whenever an initial image existed.
    timeOut: 30,
    defaultOn: true
  },
  {
    id: 'dupAtt',
    what: 'duplicate attribute values',
    contaminates: false,
    needsAccessibleName: false,
    local: false,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'autocomplete',
    what: 'name and email inputs without autocomplete attributes',
    contaminates: false,
    needsAccessibleName: true,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'phOnly',
    what: 'input elements with placeholders but no accessible names',
    contaminates: false,
    needsAccessibleName: true,
    local: true,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'buttonMenu',
    what: 'nonstandard keyboard navigation between items of button-controlled menus',
    contaminates: true,
    needsAccessibleName: false,
    local: false,
    timeOut: 15,
    defaultOn: true
  },
  {
    id: 'elements',
    what: 'data on specified elements',
    contaminates: true,
    needsAccessibleName: false,
    local: false,
    timeOut: 10,
    defaultOn: false
  },
  {
    id: 'focAll',
    what: 'discrepancies between focusable and Tab-focused elements',
    contaminates: true,
    needsAccessibleName: false,
    local: false,
    timeOut: 10,
    defaultOn: true
  },
  {
    id: 'focAndOp',
    what: 'Tab-focusable elements that are not operable or vice versa',
    contaminates: true,
    needsAccessibleName: false,
    local: false,
    timeOut: 5,
    defaultOn: true
  },
  {
    id: 'focInd',
    what: 'missing and nonstandard focus indicators',
    contaminates: true,
    needsAccessibleName: false,
    local: false,
    timeOut: 10,
    defaultOn: true
  },
  {
    id: 'focVis',
    what: 'links that are not entirely visible when focused',
    contaminates: true,
    needsAccessibleName: false,
    local: false,
    timeOut: 10,
    defaultOn: true
  },
  {
    id: 'hover',
    what: 'hover-caused content changes',
    contaminates: true,
    needsAccessibleName: false,
    local: false,
    timeOut: 20,
    defaultOn: true
  },
  {
    id: 'hovInd',
    what: 'hover indication nonstandard',
    contaminates: true,
    needsAccessibleName: false,
    local: false,
    timeOut: 10,
    defaultOn: true
  },
  {
    id: 'tabNav',
    what: 'nonstandard keyboard navigation between elements with the tab role',
    contaminates: true,
    needsAccessibleName: false,
    local: false,
    timeOut: 10,
    defaultOn: true
  },
  {
    id: 'textNodes',
    what: 'data on specified text nodes',
    contaminates: true,
    needsAccessibleName: false,
    local: false,
    timeOut: 10,
    defaultOn: false
  }
];

// ERROR HANDLER
process.on('unhandledRejection', reason => {
  console.error(`ERROR: Unhandled Promise Rejection (${reason})`);
});

// FUNCTIONS

// Conducts and reports Testaro tests.
export const reporter = async (page: Page | undefined, report: Report, actIndex: number) => {
  const act = report.acts[actIndex] as TestaroAct;
  const givenPage = page;
  const {args, stopOnFail, withItems} = act;
  // A testaro act always has a target on itself or the report; verbatim from the original.
  const target = (act.target || report.target)!;
  const url = target.url;
  const browserID = act.launch ? act.launch.browserID || report.browserID : report.browserID;
  const argRules = args ? Object.keys(args) : null;
  // Get the specification of rules to be tested for or, by default, all rules with defaultOn true.
  const ruleSpec = act.rules
  || ['y', ... allRules.filter(rule => rule.defaultOn).map(rule => rule.id)];
  // Initialize the act data.
  const data: {
    prevented: boolean;
    error: string;
    rulePreventions: Record<string, string>;
    rulesInvalid: string[];
    ruleTestTimes: [string, number][];
    ruleData: Record<string, unknown>;
    scope?: {localRules: string[]; pageRules: string[]};
  } = {
    prevented: false,
    error: '',
    rulePreventions: {},
    rulesInvalid: [],
    ruleTestTimes: [],
    ruleData: {}
  };
  // The changed subtree roots the act is scoped to, if any (report.scope, set by the acts loop).
  const scopeRoots = report.scope?.roots ?? null;
  if (scopeRoots) {
    data.scope = {localRules: [], pageRules: []};
  }
  // Initialize the act result.
  const result: {
    nativeResult: Record<string, unknown>;
    standardResult: {
      prevented: boolean;
      totals: number[];
      outcomeTotals: Record<Outcome, number>;
      instances: StandardInstance[];
    };
  } = {
    nativeResult: {},
    standardResult: getStandardResult() as {
      prevented: boolean;
      totals: number[];
      outcomeTotals: Record<Outcome, number>;
      instances: StandardInstance[];
    }
  };
  const {standardResult} = result;
  const allRuleIDs = allRules.map(rule => rule.id);
  if (
    // If the rule specification has at least 2 items
    ruleSpec.length > 1
    // and the first item is y or n
    && ['y', 'n'].includes(ruleSpec[0])
    // and all subsequent items are rule IDs to be included (if y) or excluded (if n):
    && ruleSpec.slice(1).every(ruleID => (allRuleIDs as string[]).includes(ruleID))
  ) {
    // Get the rules to be tested for and their execution order.
    const excludeIDs = ruleSpec.slice(1);
    const jobRuleIDs = ruleSpec[0] === 'y'
    ? excludeIDs
    : allRules
      .filter(rule => rule.defaultOn && ! excludeIDs.includes(rule.id))
      .map(rule => rule.id);
    const jobRules = allRules.filter(rule => jobRuleIDs.includes(rule.id));
    let justPrevented = false;
    // For each rule to be tested for:
    for (let ruleIndex = 0; ruleIndex < jobRules.length; ruleIndex++) {
      const rule = jobRules[ruleIndex];
      // Initialize the rule result.
      const ruleResult: RuleTestResult = {
        id: rule.id,
        prevented: false,
        error: '',
        data: {},
        totals: [0, 0, 0, 0],
        instances: [],
        elapsedTime: 0
      };
      console.log(`Starting rule ${ruleResult.id}`);
      // Make the browser emulate headedness in all cases, because performance does not suffer.
      const headEmulation = ruleResult.id.startsWith('shoot') ? 'high' : 'high';
      // Get whether the rule needs a new browser launched. Under page isolation the first rules
      // run on the live page provided; a contaminating rule still gets a fresh page.
      const previousRule = ruleIndex > 0 ? jobRules[ruleIndex - 1] : null;
      const needsLaunch = (ruleIndex === 0 && ! (page && report.jobData?.isolation === 'page'))
      || justPrevented
      || Boolean(previousRule?.contaminates)
      || jobRules[ruleIndex].needsAccessibleName && ! previousRule?.needsAccessibleName
      && ! (ruleIndex === 0 && page);
      const pageClosed = page && page.isClosed();
      // If it does, or if the page has closed:
      if (needsLaunch || pageClosed) {
        // If the page has closed when it is expected to be open:
        if (pageClosed && ! needsLaunch) {
          // Report this.
          console.log(`WARNING: Relaunching browser for test ${rule} after abnormal closure`);
        }
        // Create a browser, replace the page, and visit the target, retrying twice if necessary.
        page = await launch({
          report,
          actIndex,
          tempBrowserID: browserID,
          tempURL: url,
          headEmulation,
          xPathNeed: 'script',
          needsAccessibleName: jobRules[ruleIndex].needsAccessibleName,
          retries: 2
        });
      }
      // If no page exists, the launch (or the replay of a checkpoint's acts) failed: the
      // target is unreachable, so prevent the act and stop testing rules.
      if (! page) {
        const message = String(
          report.jobData?.abortMessage
          || `Launch or checkpoint replay failed before rule ${ruleResult.id}`
        );
        ruleResult.prevented = true;
        ruleResult.error = message;
        data.rulePreventions[ruleResult.id] = message;
        data.prevented = true;
        data.error = message;
        standardResult.prevented = true;
        console.log(`ERROR: ${message}`);
        break;
      }
      // Report crashes and disconnections during this test.
      let crashHandler: (() => void) | null | undefined;
      let disconnectHandler: (() => void) | null | undefined;
      if (page && ! page.isClosed()) {
        crashHandler = () => {
          console.log(`ERROR: Page crashed during ${rule} test`);
        };
        page.on('crash', crashHandler);
      }
      // The page exists whenever this runs; verbatim from the original.
      const browser = page!.context().browser();
      if (browser) {
        disconnectHandler = () => {
          console.log(`ERROR: Browser disconnected during ${rule} test`);
        };
        browser.on('disconnected', disconnectHandler);
      }
      // Restrict an element-local rule to the scope roots; a page-level rule tests the page.
      if (scopeRoots) {
        report.ruleScopeRoots = rule.local ? scopeRoots : null;
        (rule.local ? data.scope!.localRules : data.scope!.pageRules).push(rule.id);
      }
      // Initialize an argument array for the reporter.
      const ruleArgs: unknown[] = [page, report, actIndex, withItems];
      // If the rule needs a temporary directory:
      if (rule.needsTmpDir) {
        // Add its path to the argument array.
        ruleArgs.push(report.jobData!.tmpDir);
      }
      // If the testaro test act specifies extra arguments for this rule:
      if (argRules?.includes(ruleResult.id)) {
        // Add them to the argument array.
        ruleArgs.push(... args![ruleResult.id]);
      }
      const startTime = Date.now();
      let timer: Promise<{timedOut: true}>;
      try {
        // Apply a time limit to the test.
        const timeLimit = applyMultiplier(1000 * rule.timeOut);
        let timeout: NodeJS.Timeout;
        // If the time limit expires during the test:
        timer = new Promise(resolve => {
          timeout = setTimeout(() => {
            // Add data about the timeout to the rule result.
            justPrevented = true;
            ruleResult.prevented = true;
            ruleResult.error = 'Timeout';
            console.log(`ERROR: Test of testaro rule ${ruleResult.id} timed out`);
            resolve({timedOut: true});
          }, timeLimit);
        });
        // Try to perform the test and get a test report, loading the rule via the registry.
        // The RuleModule cast widens the per-rule signature union to the registry contract.
        const testReport = (ruleModules[ruleResult.id]() as RuleModule).reporter(... ruleArgs);
        // Get a test or timeout report.
        const ruleReport: {
          timedOut?: boolean;
          data?: unknown;
          totals?: number[];
          standardInstances?: unknown[];
        } = await Promise.race([timer, testReport]);
        clearTimeout(timeout!);
        // If it was a test report:
        if (! ruleReport.timedOut) {
          // Add the rule-report properties to the rule result.
          ruleResult.data = ruleReport.data;
          ruleResult.totals = ruleReport.totals as number[];
          ruleResult.instances = ruleReport.standardInstances as StandardInstance[];
          // Add the rule-result properties to the result.
          if (Object.keys(ruleReport.data as Record<string, unknown>).length) {
            data.ruleData[ruleResult.id] = ruleResult.data;
          }
          if (ruleResult.totals) {
            ruleResult.totals.forEach((total, index) => {
              standardResult.totals[index] += Math.round(total);
            });
          }
          if (ruleResult.instances?.length) {
            // Apply the rule's default outcome to instances without their own.
            ruleResult.instances.forEach(instance => {
              instance.outcome ??= rule.outcome ?? 'failed';
              if (instance.outcome === 'cantTell' && rule.uncertainty) {
                instance.uncertainty ??= rule.uncertainty;
              }
              standardResult.outcomeTotals[instance.outcome] += instance.count || 1;
            });
            standardResult.instances.push(... ruleResult.instances);
          }
          justPrevented = false;
          // If testing is to stop after a failure and the page failed the test:
          if (stopOnFail && ruleReport.totals?.some(total => total)) {
            // Test for no more rules.
            break;
          }
        }
      }
      // If an error is thrown by the test:
      catch(error) {
        ruleResult.prevented = true;
        justPrevented = true;
        const isPageClosed = ['closed', 'Protocol error', 'Target page'].some(phrase =>
          (error as Error).message.includes(phrase)
        );
        // If the page has closed:
        if (isPageClosed) {
          // Report this.
          console.log(`ERROR: Test ${ruleResult.id} failed because page closed`);
        }
        // Otherwise, i.e. if the page is open:
        else {
          // Add this to the rule result.
          ruleResult.error = (error as Error).message;
          console.log(
            `ERROR: Test of testaro rule ${ruleResult.id} prevented (${(error as Error).message})`
          );
        }
      }
      finally {
        // Add the elapsed time to the rule result.
        ruleResult.elapsedTime = Math.round((Date.now() - startTime) / 1000);
        // Add the elapsed time to the data.
        data.ruleTestTimes.push([ruleResult.id, ruleResult.elapsedTime]);
        // If the test timed out or otherwise failed:
        if (ruleResult.prevented) {
          // Add this and the error to the data.
          data.rulePreventions[ruleResult.id] = ruleResult.error;
        }
      }
      // Sort the rule test times.
      data.ruleTestTimes.sort((a, b) => b[1] - a[1]);
      // Clear the error listeners.
      if (page && ! page.isClosed() && crashHandler) {
        page.off('crash', crashHandler);
        crashHandler = null;
      }
      if (browser && disconnectHandler) {
        browser.off('disconnected', disconnectHandler);
        disconnectHandler = null;
      }
      // Force a garbage collection.
      try {
        if (global.gc) {
          global.gc();
        }
      }
      catch(error) {}
    };
  }
  // Otherwise, i.e. if the rule specification is invalid:
  else {
    // Report this and stop testing.
    standardResult.prevented = true;
    data.prevented = true;
    const message = 'ERROR: Testaro rule specification invalid';
    data.error = message;
    console.log(message);
  }
  // Close the last page the tool launched, unless it is the live page it was given.
  if (page && page !== givenPage) {
    await browserClose(page);
  }
  delete report.ruleScopeRoots;
  return {
    data,
    result
  };
};
