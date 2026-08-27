/*
  © 2021–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Page} from 'playwright';
import {getXPathCatalogIndex} from '../procs/xPath';
import type {Act, Report, StandardInstance, StandardResult} from '../types';

// TYPES

// The wave-act properties this reporter consumes.
interface WaveAct extends Act {
  reportType?: number;
  url?: string;
  prescript?: string;
  postscript?: string;
  rules?: string[];
}
// One violated rule (item) of a WAVE category; the annotation step replaces
// each selector with a [selector, xPath] pair.
interface WaveItem {
  count: number;
  description: string;
  selectors: (string | [string, string])[];
}
// One WAVE rule category.
interface WaveCategory {
  count: number;
  items?: Record<string, WaveItem>;
}
// The native result: the parsed WAVE API response.
interface WaveResult {
  categories?: Record<string, WaveCategory>;
  status: {
    success: boolean;
    error?: string;
  };
  statistics?: {
    pagetitle?: string;
    pageurl?: string;
    time?: number;
    creditsremaining?: number;
    allitemcount?: number;
    totalelements?: number;
    waveurl?: string;
  };
}
// The data of the act report.
interface WaveData {
  prevented?: boolean;
  error?: string;
  pageTitle?: string;
  pageURL?: string;
  elapsedSeconds?: number | null;
  creditsRemaining?: number | null;
  allItemCount?: number | null;
  totalElements?: number | null;
  waveURL?: string;
}

// CONSTANTS

const https = require('https') as typeof import('https');

/*
  wave
  Implements the WebAIM WAVE ruleset for accessibility. The 'reportType' argument
  specifies a WAVE report type: 1, 2, 3, or 4.
  Compiled to wave.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

// Conducts and reports the WAVE tests.
export const reporter = async (page: Page, report: Report, actIndex: number) => {
  // Create a host and a path for a request to the WAVE API.
  const act = report.acts[actIndex] as WaveAct;
  const {reportType, url, prescript, postscript, rules} = act;
  const waveKey = process.env.WAVE_KEY;
  const waveKeyParam = waveKey ? `key=${waveKey}` : '';
  let host = 'wave.webaim.org';
  if (url && url.startsWith('http')) {
    host = url.replace(/^https?:\/\//, '');
  }
  let prescriptParam = prescript ? `prescript=${prescript}` : '';
  let postscriptParam = postscript ? `postscript=${postscript}` : '';
  const wavePath = '/api/request';
  const queryParams = [
    waveKeyParam,
    `url=${page.url()}`,
    `reporttype=${reportType}`,
    prescriptParam,
    postscriptParam
  ];
  const query = queryParams.filter(param => param).join('&');
  const path = [wavePath, query].join('?');
  // Initialize the act report.
  const data: WaveData = {};
  const result: {nativeResult: WaveResult; standardResult: StandardResult} = {
    nativeResult: {} as WaveResult,
    standardResult: {}
  };
  const standard = report.standard !== 'no';
  // If standard results are to be reported:
  if (standard) {
    // Initialize the standard result.
    result.standardResult = {
      prevented: false,
      totals: [0, 0, 0, 0],
      instances: []
    };
  }
  // Get and process a WAVE API report and return the results.
  return await new Promise<{data: WaveData; result: typeof result}>(resolve => https.get(
    {
      host,
      path
    },
    response => {
      let rawReport = '';
      response.on('data', chunk => {
        rawReport += chunk;
      });
      // When the response arrives:
      response.on('end', async () => {
        try {
          // Parse it as JSON.
          result.nativeResult = JSON.parse(rawReport);
        }
        // If it was not parsable:
        catch (error) {
          // Report this.
          data.prevented = true;
          data.error = (error as Error).message;
          result.nativeResult = {} as WaveResult;
        }
        // If the response was parsed:
        if (! data.prevented) {
          const {categories, status} = result.nativeResult;
          // If the request succeeded and produced categories:
          if(status.success && categories) {
            // Delete the unnecessary properties of the categories.
            delete categories.feature;
            delete categories.structure;
            delete categories.aria;
            // For each WAVE rule category:
            for (const categoryName of ['error', 'contrast', 'alert']) {
              const category = categories[categoryName];
              const ordinalSeverity = categoryName === 'alert' ? 0 : 3;
              // If any violated rules (named items by WAVE) were reported:
              if (
                category?.items
                && Object.keys(category.items).length
              ) {
                const {items} = category as Required<WaveCategory>;
                // If rules to be tested for were specified:
                if (rules && rules.length) {
                  // For each rule violated:
                  Object.keys(items).forEach(ruleID => {
                    // If it was not a specified rule:
                    if (! rules.includes(ruleID)) {
                      // Decrease the category violation count by the count of its violations.
                      category.count -= items[ruleID].count;
                      // Remove its violations from the native result.
                      delete items[ruleID];
                    }
                  });
                }
                // If standard results are to be reported:
                if (standard) {
                  const {standardResult} = result;
                  const {totals, instances} = standardResult as Required<StandardResult>;
                  // Add the category violation count to the standard-result totals.
                  totals[ordinalSeverity] += category.count;
                  const annotatedItems = await page.evaluate(items => {
                    const ruleIDs = Object.keys(items);
                    // For each rule of the category with any violations:
                    ruleIDs.forEach(ruleID => {
                      const {selectors} = items[ruleID];
                      // For each of those violations:
                      for (const index in selectors) {
                        const selector = selectors[index as unknown as number] as string;
                        let violator: Element | null | undefined;
                        try {
                          // Get the violator.
                          violator = document.querySelector(selector);
                          // If this succeeded:
                          if (violator) {
                            // Concatenate the selector with the XPath of the violator.
                            selectors[index as unknown as number] = [
                              selector, window.getXPath(violator as Element) ?? ''
                            ];
                          }
                        } catch (error) {
                          console.error(`ERROR: Invalid selector: ${selector} (${(error as Error).message})`);
                        }
                      }
                    });
                    return items;
                  }, items);
                  const ruleIDs = Object.keys(annotatedItems);
                  // For each rule of the category with any violations:
                  for (const ruleID of ruleIDs) {
                    const {description, selectors} = annotatedItems[ruleID];
                    // For each violation of the rule:
                    for (const violation of selectors) {
                      // Initialize a standard instance.
                      const instance: StandardInstance = {
                        ruleID,
                        what: description,
                        ordinalSeverity,
                        count: 1
                      };
                      // If the selector has been converted to a selector-XPath pair:
                      if (Array.isArray(violation)) {
                        const xPath = violation[1];
                        // Add the catalog index to the instance.
                        instance.catalogIndex = getXPathCatalogIndex(report, xPath);
                      }
                      // Add the instance to the standard result.
                      instances.push(instance);
                    }
                  }
                }
              }
            }
          }
          // Otherwise, if the request failed:
          else if (! status.success) {
            // Report this.
            data.prevented = true;
            data.error = status.error || 'Unknown error';
          }
          const {statistics} = result.nativeResult;
          if (statistics) {
            // Copy important data from the native result to the result.
            data.pageTitle = statistics.pagetitle || '';
            data.pageURL = statistics.pageurl || '';
            data.elapsedSeconds = statistics.time || null;
            data.creditsRemaining = statistics.creditsremaining || null;
            console.log(`WAVE credits remaining: ${data.creditsRemaining}`);
            data.allItemCount = statistics.allitemcount || null;
            data.totalElements = statistics.totalelements || null;
            data.waveURL = statistics.waveurl || '';
          }
        }
        // Return the result.
        resolve({
          data,
          result
        });
      });
    }
  ));
};
