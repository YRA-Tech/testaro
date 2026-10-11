/*
  © 2021–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import {readFile} from 'fs/promises';
import {fileURLToPath} from 'url';
import {request} from 'playwright';
import type {APIRequestContext, Page} from 'playwright';
import {getNormalizedXPath, getXPathCatalogIndex} from '../procs/xPath';
import {getStandardResult, addInstance} from '../procs/standard';
import {applyMultiplier, getScannerId} from '../procs/config';
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
  reckless?: boolean;
}
// A stylesheet of the page whose material rules alfa did not receive.
interface StyleLoss {
  // The URL of the sheet, or a description of an inline or constructed sheet.
  sheet: string;
  // Why alfa lacks the rules: the sheet failed to reload with CORS and is empty (as in Firefox), page scripts cannot read its rules (as also in Chromium and WebKit after a failed reload), or alfa did not serialize them.
  reason: 'unloaded' | 'unreadable' | 'unserialized';
  // How many material rules alfa lacks, or null if they could not be counted.
  ruleCount: number | null;
}
// A stylesheet of the page as page scripts see it.
interface PageSheet {
  sheet: string;
  // Whether the sheet comes from an origin other than the page’s.
  isCrossOrigin: boolean;
  // Material rules of the sheet, or null if page scripts cannot read them.
  ruleCount: number | null;
  // URLs of imported sheets whose rules page scripts cannot read.
  unreadableImports: string[];
}
// A rule in the JSON serialization of an alfa stylesheet.
interface AlfaRuleJSON {
  type: string;
  rules?: AlfaRuleJSON[];
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

/*
  A material rule is one that can affect how a page is presented on screen. Font-face rules (which only make fonts available) and page rules (which apply only to printing) are not material, and neither are the rules nested in page rules.
*/
// Counts the material rules in an alfa serialization of rules.
const countAlfaRules = (rules: AlfaRuleJSON[]): number => rules.reduce(
  (count, rule) => ['font-face', 'page'].includes(rule.type)
    ? count
    : count + 1 + countAlfaRules(rule.rules ?? []),
  0
);
// Gets the document stylesheets of the page as page scripts see them, in alfa’s order.
const getPageSheets = (page: Page): Promise<PageSheet[]> => page.evaluate(() => {
  // Counts the material rules in a list of rules, recording imports whose rules are unreadable.
  const countRules = (rules: CSSRuleList, unreadableImports: string[]): number => {
    let count = 0;
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule || rule instanceof CSSPageRule) {
        continue;
      }
      count++;
      if (rule instanceof CSSImportRule) {
        if (rule.styleSheet) {
          try {
            count += countRules(rule.styleSheet.cssRules, unreadableImports);
          }
          catch (error) {
            unreadableImports.push(rule.styleSheet.href || rule.href);
          }
        }
      }
      // Grouping, keyframes, and style rules can contain rules (style rules by CSS nesting).
      else if ('cssRules' in rule) {
        count += countRules((rule as CSSGroupingRule).cssRules, unreadableImports);
      }
    }
    return count;
  };
  // Alfa serializes the document sheets first and then the constructed (adopted) sheets.
  const sheets = [...Array.from(document.styleSheets), ...(document.adoptedStyleSheets ?? [])];
  return sheets.map((sheet, index) => {
    const unreadableImports: string[] = [];
    const sheetName = sheet.href
      || (sheet.ownerNode ? `inline sheet ${index}` : `constructed sheet ${index}`);
    const isCrossOrigin = !! sheet.href && new URL(sheet.href).origin !== location.origin;
    let ruleCount: number | null = null;
    try {
      ruleCount = countRules(sheet.cssRules, unreadableImports);
    }
    catch (error) {}
    return {sheet: sheetName, isCrossOrigin, ruleCount, unreadableImports};
  });
});
// Returns the hrefs of the @import rules of a stylesheet text.
const getImportHrefs = (text: string): string[] => {
  // Erase comments, which can contain import-like text.
  let rest = text.replace(/\/\*[\s\S]*?\*\//g, ' ').trimStart();
  const hrefs: string[] = [];
  /*
    An import rule is valid only before all other rules except charset rules and layer
    statements. Scan the leading statements and stop at the first other rule; browsers ignore
    any later import rules.
  */
  const importRE = /^@import\s+(?:url\(\s*["']?([^"')]+?)["']?\s*\)|["']([^"']+)["'])[^;]*(?:;|$)/i;
  const preludeRE = /^@(?:charset\s+["'][^"']+["']|layer\s+[^;{]+);/i;
  while (rest.length) {
    const importMatch = rest.match(importRE);
    if (importMatch) {
      hrefs.push((importMatch[1] ?? importMatch[2]).trim());
      rest = rest.slice(importMatch[0].length).trimStart();
      continue;
    }
    const preludeMatch = rest.match(preludeRE);
    if (preludeMatch) {
      rest = rest.slice(preludeMatch[0].length).trimStart();
      continue;
    }
    break;
  }
  return hrefs;
};
// Returns the scheme family of a URL: file, http (including https), data, or other.
const getSchemeFamily = (url: string): string => {
  if (url.startsWith('file:')) {
    return 'file';
  }
  if (/^https?:/.test(url)) {
    return 'http';
  }
  return url.startsWith('data:') ? 'data' : 'other';
};
// Gets the text of a stylesheet that page scripts cannot read, or null if it is unavailable.
const getSheetText = async (fetcher: APIRequestContext, url: string): Promise<string | null> => {
  try {
    const family = getSchemeFamily(url);
    // If the sheet is a local file (each file URL being an origin of its own):
    if (family === 'file') {
      // Read it.
      return await readFile(fileURLToPath(url), 'utf8');
    }
    // Otherwise, if the sheet is a data URL:
    if (family === 'data') {
      // Decode it.
      const commaIndex = url.indexOf(',');
      if (commaIndex === -1) {
        return null;
      }
      const payload = url.slice(commaIndex + 1);
      return url.slice(5, commaIndex).endsWith(';base64')
        ? Buffer.from(payload, 'base64').toString('utf8')
        : decodeURIComponent(payload);
    }
    // Otherwise, if it is an HTTP resource:
    if (family === 'http') {
      // Fetch it outside the page, where the cross-origin rule does not apply.
      const response = await fetcher.get(url, {timeout: applyMultiplier(5000)});
      return response.ok() ? await response.text() : null;
    }
    return null;
  }
  catch (error) {
    return null;
  }
};
/*
  Counts the material rules in the text of a stylesheet that page scripts cannot read, plus
  those of the stylesheets it validly imports, fetched relative to its URL. Each import rule
  counts as 1, as it does for page scripts. An import is followed only if its URL is a data URL
  or has the scheme family (file or http) of the sheet at the root of the import chain, as a
  browser would not let a web page import a local file; otherwise only its rule is counted.
  Returns null if the rules of any followed import cannot be counted.
*/
const countTextRules = async (
  page: Page, fetcher: APIRequestContext, text: string, url: string, visited: string[] = []
): Promise<number | null> => {
  try {
    // Count the sheet’s own material rules in a sheet constructed by the page, whose rules are readable.
    const ownCount = await page.evaluate(text => {
      const countRules = (rules: CSSRuleList): number => {
        let count = 0;
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSFontFaceRule || rule instanceof CSSPageRule) {
            continue;
          }
          count++;
          if ('cssRules' in rule) {
            count += countRules((rule as CSSGroupingRule).cssRules);
          }
        }
        return count;
      };
      const sheet = new CSSStyleSheet();
      // This ignores any @import rules in the text; they are counted below instead.
      sheet.replaceSync(text);
      return countRules(sheet.cssRules);
    }, text);
    // Add the import rules themselves and the material rules of the sheets they import.
    const importHrefs = getImportHrefs(text);
    let count = ownCount + importHrefs.length;
    // Guard against circular imports.
    const visitedNext = [...visited, url];
    const rootFamily = getSchemeFamily(visitedNext[0]);
    for (const href of importHrefs) {
      let importURL: string;
      try {
        importURL = new URL(href, url).href;
      }
      catch (error) {
        continue;
      }
      const importFamily = getSchemeFamily(importURL);
      const isFollowable = importFamily === 'data' || importFamily === rootFamily;
      if (isFollowable && ! visitedNext.includes(importURL)) {
        const importText = await getSheetText(fetcher, importURL);
        const importCount = importText === null
          ? null
          : await countTextRules(page, fetcher, importText, importURL, visitedNext);
        // If the rules of the imported sheet cannot be counted, neither can those of this sheet.
        if (importCount === null) {
          return null;
        }
        count += importCount;
      }
    }
    return count;
  }
  catch (error) {
    return null;
  }
};
/*
  Alfa reads a page’s styles by running a script in the page. It silently treats a sheet as empty if page scripts cannot read its rules (a cross-origin sheet requested without CORS) or if the sheet contains a rule type alfa does not support (such as @property or @container); it treats a @media block containing such a rule as empty; and it omits rules nested in style rules (CSS nesting). Alfa then tests the page as if those rules did not exist. Its enforceAnonymousCrossOrigin option reloads cross-origin sheets with CORS, making them readable, but a sheet whose server refuses CORS then fails to load, and the page as well as alfa loses its rules: Chromium and WebKit leave the sheet unreadable, and Firefox leaves it empty. This function reports the stylesheets whose material rules alfa did not receive. It does not inspect sheets in shadow roots.
*/
// Gets the stylesheets of the page whose material rules alfa did not receive.
const getStyleLosses = async (
  page: Page, fetcher: APIRequestContext, alfaSheets: {toJSON: () => {rules: AlfaRuleJSON[]}}[]
): Promise<StyleLoss[]> => {
  const losses: StyleLoss[] = [];
  const pageSheets = await getPageSheets(page);
  const unreadableURLs: string[] = [];
  const emptyCrossOriginURLs: string[] = [];
  pageSheets.forEach((pageSheet, index) => {
    const {sheet, isCrossOrigin, ruleCount, unreadableImports} = pageSheet;
    // If page scripts cannot read the sheet:
    if (ruleCount === null) {
      // Postpone the decision until its text can be inspected.
      unreadableURLs.push(sheet);
    }
    // Otherwise, if it is a cross-origin sheet that seems empty, perhaps because it failed to reload:
    else if (isCrossOrigin && ruleCount === 0) {
      // Postpone the decision until its text can be inspected.
      emptyCrossOriginURLs.push(sheet);
    }
    else {
      const alfaSheet = alfaSheets[index];
      const alfaCount = alfaSheet ? countAlfaRules(alfaSheet.toJSON().rules) : 0;
      // If alfa received fewer material rules than the page has:
      if (alfaCount < ruleCount) {
        losses.push({sheet, reason: 'unserialized', ruleCount: ruleCount - alfaCount});
      }
    }
    unreadableURLs.push(...unreadableImports);
  });
  // For each sheet that page scripts cannot read:
  for (const url of unreadableURLs) {
    const text = await getSheetText(fetcher, url);
    const ruleCount = text === null ? null : await countTextRules(page, fetcher, text, url);
    // If it has material rules or they could not be counted, report it.
    if (ruleCount !== 0) {
      losses.push({sheet: url, reason: 'unreadable', ruleCount});
    }
  }
  // For each cross-origin sheet that seems empty:
  for (const url of emptyCrossOriginURLs) {
    const text = await getSheetText(fetcher, url);
    // If its text is available:
    if (text !== null) {
      const ruleCount = await countTextRules(page, fetcher, text, url);
      // If it has material rules or rules of its imports could not be counted, report it.
      if (ruleCount !== 0) {
        losses.push({sheet: url, reason: 'unloaded', ruleCount});
      }
    }
  }
  return losses;
};
// Conducts and reports the alfa tests.
export const reporter = async (page: Page, report: Report, actIndex: number) => {
  const act = report.acts[actIndex] as AlfaAct;
  const {rules, reckless} = act;
  // If only some rules are to be employed:
  if (rules && rules.length) {
    // Remove the other rules.
    alfaRules = alfaRules.filter(
      (rule: {uri: string}) => rules.includes(rule.uri.replace(/^.+-/, ''))
    );
  }
  // Initialize the act report.
  const data: {prevented?: boolean; error?: string; styleLosses?: StyleLoss[]} = {};
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
    /*
      Under page isolation, the page is the live page of a checkpoint, which later acts observe,
      so it must remain unchanged. Alfa’s enforceAnonymousCrossOrigin option changes the page:
      it replaces every link element lacking a crossorigin attribute with a clone that has one,
      so the browser reloads it, and a stylesheet whose server refuses CORS then loses its
      rules. Without the option, alfa and this reporter only read the page.
    */
    const isPageShared = report.jobData?.isolation === 'page';
    const doc = await page.evaluateHandle('document');
    // Get the alfa version of the page, first reloading cross-origin sheets with CORS if permitted.
    const alfaPage = await Playwright.toPage(doc, {enforceAnonymousCrossOrigin: ! isPageShared});
    /*
      Fetch stylesheets with the page’s own request context, unless the page is shared, in which
      case use a separate context, so that cookies set by the responses do not reach the page.
    */
    const fetcher = isPageShared
      ? await request.newContext({
        userAgent: await page.evaluate(() => navigator.userAgent),
        extraHTTPHeaders: getScannerId(report) ? {'X-YRA-Scanner': getScannerId(report)} : {}
      })
      : page.request;
    let styleLosses: StyleLoss[];
    try {
      // Get the stylesheets whose material rules alfa did not receive.
      styleLosses = await getStyleLosses(page, fetcher, Array.from(alfaPage.document.style));
    }
    finally {
      if (isPageShared) {
        await fetcher.dispose();
      }
    }
    // If there are any:
    if (styleLosses.length) {
      // Report them.
      data.styleLosses = styleLosses;
      // If the act does not permit testing a page with incomplete styles:
      if (! reckless) {
        // Report the act as prevented.
        data.prevented = true;
        data.error = `Alfa cannot test page correctly because it lacks the style rules of ${styleLosses.length} stylesheet${styleLosses.length > 1 ? 's' : ''}`;
        if (standard) {
          result.standardResult.prevented = true;
        }
        console.log(`ERROR: ${data.error}`);
        return {
          data,
          result
        };
      }
    }
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
