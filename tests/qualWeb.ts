/*
  © 2023–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Page} from 'playwright';
import {getAttributeXPath, getXPathCatalogIndex} from '../procs/xPath';
import {getStandardResult, addInstance} from '../procs/standard';
import type {Act, Report, StandardInstance, StandardResult} from '../types';
/*
  The @qualweb packages declare their types only in package-exports maps, which
  this project's node10 module resolution cannot read, so the imports stay
  requires and are untyped.
*/
const {QualWeb} = require('@qualweb/core');
const {ACTRules} = require('@qualweb/act-rules');
const {WCAGTechniques} = require('@qualweb/wcag-techniques');
const {BestPractices} = require('@qualweb/best-practices');
const {PlaywrightDriver} = require('@qualweb/playwright-driver');

// TYPES

// The qualWeb-act properties this reporter consumes.
interface QualWebAct extends Act {
  rules?: string[];
}
// The section names of a QualWeb report.
type QwSection = 'act-rules' | 'wcag-techniques' | 'best-practices';
// One element reported by a QualWeb assertion result.
interface QwElement {
  htmlCode?: string;
}
// One result of a QualWeb rule assertion.
interface QwRaResult {
  verdict: string;
  description?: string;
  elements?: QwElement[];
}
// The assertions for one QualWeb rule.
interface QwRuleAssertions {
  metadata?: {
    warning?: number;
    failed?: number;
  };
  results: QwRaResult[];
}
// One module section of a QualWeb report.
interface QwModuleReport {
  assertions?: Record<string, QwRuleAssertions>;
}
// The native result: the customHtml QualWeb report.
interface QwNativeResult {
  system?: {
    page?: {
      dom?: unknown;
    };
  };
  modules?: Record<string, QwModuleReport>;
}
// The options of a QualWeb evaluation.
interface QualWebOptions {
  log: {console: boolean; file: boolean};
  crawlOptions: {
    maxDepth: number;
    maxUrls: number;
    timeout: number;
    maxParallelCrawls: number;
    logging: boolean;
  };
  execute: {counter: boolean; act?: boolean; wcag?: boolean; bp?: boolean};
  modules: unknown[];
  html?: string;
  'act-rules'?: {rules?: string[]; levels?: string[]; principles?: string[]};
  'wcag-techniques'?: {techniques?: string[]; levels?: string[]; principles?: string[]};
  'best-practices'?: {bestPractices?: string[]};
}

// CONSTANTS

// QualWeb core engine with Playwright as driver.
const qualWeb = new QualWeb(undefined, new PlaywrightDriver({
  adBlock: true,
  stealth: true
}));
const actRulesModule = new ACTRules({});
const wcagModule = new WCAGTechniques({});
const bpModule = new BestPractices({});
// Mapping of QualWeb module violation types to ordinal severities.
const ordinalSeverities: Record<QwSection, Record<string, StandardInstance['ordinalSeverity']>> = {
  'act-rules': {
    'warning': 1,
    'failed': 3
  },
  'wcag-techniques': {
    'warning': 0,
    'failed': 2
  },
  'best-practices': {
    'warning': 0,
    'failed': 1
  }
}

/*
  qualWeb
  Implements the QualWeb ruleset for accessibility.
  Compiled to qualWeb.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

// Conducts and reports the QualWeb tests.
export const reporter = async (page: Page, report: Report, actIndex: number, timeLimit: number) => {
  const act = report.acts[actIndex] as QualWebAct;
  const {rules} = act;
  const clusterOptions = {
    maxConcurrency: 1,
    timeout: timeLimit * 1000,
    monitor: false
  };
  // Initialize the act report.
  const data: {prevented?: boolean; error?: string} = {};
  const result: {nativeResult: QwNativeResult; standardResult: StandardResult} = {
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
    // Start the QualWeb core engine, which launches a Playwright browser.
    await qualWeb.start(clusterOptions);
  }
  // If the start fails:
  catch(error) {
    return {
      data: {
        prevented: true,
        error: `Core engine start failed (${(error as Error).message})`
      },
      result
    };
  }
  // Otherwise, i.e. if the start succeeds, specify the invariant test options.
  const qualWebOptions: QualWebOptions = {
    log: {
      console: false,
      file: false
    },
    crawlOptions: {
      maxDepth: 0,
      maxUrls: 1,
      timeout: timeLimit * 1000,
      maxParallelCrawls: 1,
      logging: true
    },
    execute: {
      counter: true
    },
    modules: []
  };
  try {
    // Provide the page content, including the data-xpath attributes.
    qualWebOptions.html = await page.content();
    // Specify which rules to test for, adding a custom execute property for report processing.
    const actSpec = rules ? rules.find(typeRules => typeRules.startsWith('act:')) : null;
    const wcagSpec = rules ? rules.find(typeRules => typeRules.startsWith('wcag:')) : null;
    const bestSpec = rules ? rules.find(typeRules => typeRules.startsWith('best:')) : null;
    if (actSpec) {
      if (actSpec === 'act:') {
        qualWebOptions.execute.act = false;
      }
      else {
        const actRules = actSpec.slice(4).split(',').map(num => `QW-ACT-R${num}`);
        qualWebOptions['act-rules'] = {rules: actRules};
        qualWebOptions.modules.push(actRulesModule);
        qualWebOptions.execute.act = true;
      }
    }
    else {
      qualWebOptions['act-rules'] = {
        levels: ['A', 'AA', 'AAA'],
        principles: ['Perceivable', 'Operable', 'Understandable', 'Robust']
      };
      qualWebOptions.modules.push(actRulesModule);
      qualWebOptions.execute.act = true;
    }
    if (wcagSpec) {
      if (wcagSpec === 'wcag:') {
        qualWebOptions.execute.wcag = false;
      }
      else {
        const wcagTechniques = wcagSpec.slice(5).split(',').map(num => `QW-WCAG-T${num}`);
        qualWebOptions['wcag-techniques'] = {techniques: wcagTechniques};
        qualWebOptions.modules.push(wcagModule);
        qualWebOptions.execute.wcag = true;
      }
    }
    else {
      qualWebOptions['wcag-techniques'] = {
        levels: ['A', 'AA', 'AAA'],
        principles: ['Perceivable', 'Operable', 'Understandable', 'Robust']
      };
      qualWebOptions.modules.push(wcagModule);
      qualWebOptions.execute.wcag = true;
    }
    if (bestSpec) {
      if (bestSpec === 'best:') {
        qualWebOptions.execute.bp = false;
      }
      else {
        const bestPractices = bestSpec.slice(5).split(',').map(num => `QW-BP${num}`);
        qualWebOptions['best-practices'] = {bestPractices};
        qualWebOptions.modules.push(bpModule);
        qualWebOptions.execute.bp = true;
      }
    }
    else {
      qualWebOptions['best-practices'] = {};
      qualWebOptions.modules.push(bpModule);
      qualWebOptions.execute.bp = true;
    }
    let qwReport;
    try {
      // Get the report.
      qwReport = await qualWeb.evaluate(qualWebOptions);
    }
    catch(error) {
      return {
        data: {
          prevented: true,
          error: `qualWeb evaluation failed (${(error as Error).message})`
        },
        result
      };
    }
    // Add the report to the result.
    result.nativeResult = qwReport.customHtml;
    const {nativeResult, standardResult} = result;
    // If the report contains, as it should, a copy of the DOM:
    if (nativeResult?.system?.page?.dom) {
      // Delete the copy for parsimony.
      delete nativeResult.system.page.dom;
      const {modules} = nativeResult;
      // If the report contains, as it should, a modules property:
      if (modules) {
        // For each test section in it:
        for (const section of ['act-rules', 'wcag-techniques', 'best-practices'] as QwSection[]) {
          // If testing in the section was specified:
          if (qualWebOptions[section]) {
            // If the section exists:
            if (modules[section]) {
              const {assertions} = modules[section];
              // If it contains assertions (test results):
              if (assertions) {
                const ruleIDs = Object.keys(assertions);
                // For each rule:
                for (const ruleID of ruleIDs) {
                  const ruleAssertions = assertions[ruleID];
                  const {metadata} = ruleAssertions;
                  // If there were any warnings or failures:
                  if (metadata?.warning || metadata?.failed) {
                    // Delete nonviolations from the results.
                    ruleAssertions.results = ruleAssertions.results.filter(
                      raResult => raResult.verdict !== 'passed'
                    );
                    // For each test result:
                    for (const raResult of ruleAssertions.results) {
                      const {elements, verdict} = raResult;
                      // If any violations are reported:
                      if (elements?.length) {
                        // For each violating element:
                        for (const element of elements) {
                          // Limit the size of its reported excerpt.
                          if ((element.htmlCode?.length as number) > 2000) {
                            element.htmlCode = `${element.htmlCode!.slice(0, 2000)} …`;
                          }
                          // If standard results are to be reported:
                          if (standard) {
                            const what = `[${verdict}] ${raResult.description}`;
                            const xPath = getAttributeXPath(element.htmlCode);
                            // Add an instance to the standard result.
                            addInstance(standardResult, {
                              ruleID,
                              what,
                              ordinalSeverity: ordinalSeverities[section][verdict],
                              outcome: verdict === 'warning' ? 'cantTell' : 'failed',
                              catalogIndex: getXPathCatalogIndex(report, xPath)
                            });
                          }
                        };
                      }
                    };
                  }
                  // Otherwise, i.e. if there were no warnings or failures:
                  else {
                    // Delete the rule.
                    delete assertions[ruleID];
                  }
                };
              }
              // Otherwise, i.e. if it contains no assertions:
              else {
                // Report this.
                data.prevented = true;
                data.error = 'No assertions';
              }
            }
            // Otherwise, i.e. if the section is missing:
            else {
              // Report this.
              data.prevented = true;
              data.error = `No ${section} section`;
            }
          }
        }
      }
      // Otherwise, i.e. if the report does not contain a modules property:
      else {
        // Report this.
        data.prevented = true;
        data.error = 'No modules';
      }
    }
    // Otherwise, i.e. if the report does not contain a copy of the DOM:
    else {
      // Report this.
      data.prevented = true;
      data.error = 'No DOM';
    }
    // Stop the QualWeb core engine.
    await qualWeb.stop();
    // Test whether the result is an object.
    try {
      JSON.stringify(result);
    }
    catch(error) {
      data.prevented = true;
      data.error = `QualWeb result cannot be made JSON (${(error as Error).message})`;
    }
  }
  catch(error) {
    data.prevented = true;
    data.error = `QualWeb failed (${(error as Error).message})`;
  }
  return {
    data,
    result
  };
};
