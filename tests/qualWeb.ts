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
import {readFileSync} from 'fs';

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
// The native result: the module reports, keyed by section, as in QualWeb's own report.
interface QwNativeResult {
  system?: {url?: string; evaluation?: string};
  modules?: Record<string, QwModuleReport>;
}
// The options of one section's runner (QualWeb's EvaluationModule options).
interface QwSectionOptions {
  include?: string[];
  exclude?: string[];
  levels?: string[];
  principles?: string[];
}

// CONSTANTS

/*
  QualWeb runs in the page under test, as @qualweb/core runs it in its own browser: the
  page-side bundles first, then one bundle per section. It used to be given page.content() and
  run by @qualweb/core, which loads that HTML with setContent() into a blank page — so relative
  stylesheet links resolved nowhere, the page it tested was unstyled, and every CSS-dependent
  rule (contrast, visibility, text spacing…) judged a page the user never sees. The bundles are
  evaluated (not added as script tags), so the page's Content Security Policy does not apply.
*/
const readBundle = (name: string): string => readFileSync(require.resolve(name), 'utf8');
let pageBundles: string[] | null = null;
const sectionBundles: Partial<Record<QwSection, string>> = {};
const sectionPackages: Record<QwSection, string> = {
  'act-rules': '@qualweb/act-rules',
  'wcag-techniques': '@qualweb/wcag-techniques',
  'best-practices': '@qualweb/best-practices'
};
// Rules a section may exclude after they crash before the section is given up on.
const MAX_EXCLUDED = 5;
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
  // Initialize the act report.
  const data: {prevented?: boolean; error?: string; rulePreventions?: Record<string, string>} = {};
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
  /*
    QualWeb tests HTML documents only: on anything else (e.g. an SVG image) its rules report
    false results such as a missing lang on the html element.
  */
  const rootNamespace = await page.evaluate(() => document.documentElement?.namespaceURI ?? null)
  .catch(() => null);
  // If the document is not HTML:
  if (rootNamespace !== 'http://www.w3.org/1999/xhtml') {
    // Report this.
    return {
      data: {
        prevented: true,
        error: `qualWeb tests HTML documents only (root namespace ${rootNamespace})`
      },
      result
    };
  }
  // Specify, per section, whether and what to test (a rules spec of 'act:', 'wcag:' or 'best:'
  // alone skips that section; with numbers, it tests only those rules).
  const allAAA = {
    levels: ['A', 'AA', 'AAA'],
    principles: ['Perceivable', 'Operable', 'Understandable', 'Robust']
  };
  const sectionSpec = (prefix: string, codePrefix: string, all: QwSectionOptions): QwSectionOptions | null => {
    const spec = rules?.find(typeRules => typeRules.startsWith(prefix));
    if (spec === undefined) {
      return all;
    }
    if (spec === prefix) {
      return null;
    }
    return {include: spec.slice(prefix.length).split(',').map(num => `${codePrefix}${num}`)};
  };
  const sections: Partial<Record<QwSection, QwSectionOptions>> = {};
  for (const [section, options] of [
    ['act-rules', sectionSpec('act:', 'QW-ACT-R', allAAA)],
    ['wcag-techniques', sectionSpec('wcag:', 'QW-WCAG-T', allAAA)],
    ['best-practices', sectionSpec('best:', 'QW-BP', {})]
  ] as [QwSection, QwSectionOptions | null][]) {
    if (options) {
      sections[section] = options;
    }
  }
  const deadline = Date.now() + timeLimit * 1000;
  try {
    // Load QualWeb into the page.
    pageBundles ??= ['@qualweb/qw-page', '@qualweb/util', '@qualweb/locale'].map(readBundle);
    for (const source of pageBundles) {
      await page.evaluate(source);
    }
    // The page's own source, which QualWeb's meta-element rules read.
    const sourceHtml = await page.content();
    const modules: Record<string, QwModuleReport> = {};
    const rulePreventions: Record<string, string> = {};
    // For each section to be tested:
    for (const [section, options] of Object.entries(sections) as [QwSection, QwSectionOptions][]) {
      if (Date.now() > deadline) {
        throw new Error(`time limit of ${timeLimit}s reached before ${section}`);
      }
      sectionBundles[section] ??= readBundle(sectionPackages[section]);
      await page.evaluate(sectionBundles[section]!);
      /*
        One rule that throws takes its whole section down with it (e.g. QW-ACT-R76 in 0.8.5 on
        lab(), oklab(), color() or color-mix() colours, qualweb/qualweb#352), so a rule named in
        the stack trace of a crash is excluded and the section rerun; a crash that names no rule
        prevents only its section.
      */
      const outcome = await page.evaluate(({section, options, sourceHtml, maxExcluded}) => {
        // Only this section's bundle has been loaded, so name only its runner.
        const Runner = section === 'act-rules'
          // @ts-expect-error: defined by the section bundle evaluated above.
          ? ACTRulesRunner
          : section === 'wcag-techniques'
            // @ts-expect-error: defined by the section bundle evaluated above.
            ? WCAGTechniquesRunner
            // @ts-expect-error: defined by the section bundle evaluated above.
            : BestPracticesRunner;
        const preventions: Record<string, string> = {};
        const exclude: string[] = [];
        for (;;) {
          try {
            const opts = exclude.length ? {...options, exclude: [...(options.exclude ?? []), ...exclude]} : options;
            const runner = new Runner(opts, 'en').configure(opts).test({sourceHtml, newTabWasOpen: false});
            (window as any).__testaroQwRunners = {...(window as any).__testaroQwRunners, [section]: runner};
            // QualWeb core keeps the act-rules runner here for its special-case pass.
            if (section === 'act-rules') {
              (window as any).act = runner;
            }
            return {ok: true, preventions};
          }
          catch(error) {
            const message = String((error as Error)?.message ?? error).slice(0, 200);
            // Rule classes are named QW_ACT_R76, QW_WCAG_T23, QW_BP1.
            const rule = String((error as Error)?.stack ?? '').match(/QW_(?:ACT_R|WCAG_T|BP)\d+/)?.[0].replace(/_/g, '-');
            if (! rule || exclude.includes(rule) || exclude.length >= maxExcluded) {
              preventions[section] = `section failed: ${message}`;
              return {ok: false, preventions};
            }
            preventions[rule] = message;
            exclude.push(rule);
          }
        }
      }, {section, options, sourceHtml, maxExcluded: MAX_EXCLUDED});
      Object.assign(rulePreventions, outcome.preventions);
      if (! outcome.ok) {
        continue;
      }
      /*
        QualWeb core's special case for act-rules: QW-ACT-R40 (zoomed text not clipped) is
        re-tested at a 640 × 512 viewport, then the viewport is restored.
      */
      const include = options.include;
      if (section === 'act-rules' && (! include || include.includes('QW-ACT-R40'))) {
        const viewport = page.viewportSize();
        if (viewport) {
          try {
            await page.setViewportSize({width: 640, height: 512});
            await page.evaluate(() => (window as any).act?.testSpecial?.());
          }
          catch(error) {
            rulePreventions['QW-ACT-R40'] = `special-case pass failed: ${String((error as Error).message).slice(0, 200)}`;
          }
          finally {
            await page.setViewportSize(viewport);
          }
        }
      }
      modules[section] = await page.evaluate(
        section => JSON.parse(JSON.stringify((window as any).__testaroQwRunners[section].getReport())),
        section
      );
    }
    if (Object.keys(rulePreventions).length) {
      data.rulePreventions = rulePreventions;
    }
    // Add the module reports to the result.
    result.nativeResult = {system: {url: page.url(), evaluation: 'in-page'}, modules};
    const {standardResult} = result;
    // For each section that was to be tested:
    for (const section of Object.keys(sections) as QwSection[]) {
      const moduleReport = modules[section];
      /*
        A section that failed as a whole is recorded in rulePreventions; the act is prevented
        only if no section ran.
      */
      if (! moduleReport) {
        continue;
      }
      const {assertions} = moduleReport;
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
    }
    // If no section ran:
    if (! Object.keys(modules).length) {
      // Report this.
      data.prevented = true;
      data.error = `No qualWeb section ran (${JSON.stringify(rulePreventions).slice(0, 300)})`;
    }
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
