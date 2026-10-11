"use strict";
/*
  © 2021–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.reporter = void 0;
// IMPORTS
const promises_1 = require("fs/promises");
const url_1 = require("url");
const xPath_1 = require("../procs/xPath");
const standard_1 = require("../procs/standard");
const config_1 = require("../procs/config");
/*
  The alfa packages are pure ESM that Node loads via require(esm); their own
  types do not resolve under this project's node10 module resolution, so the
  imports stay requires and are untyped.
*/
let alfaRules = require('@siteimprove/alfa-rules').default;
const { Audit } = require('@siteimprove/alfa-act');
const { Playwright } = require('@siteimprove/alfa-playwright');
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
const countAlfaRules = (rules) => rules.reduce((count, rule) => ['font-face', 'page'].includes(rule.type)
    ? count
    : count + 1 + countAlfaRules(rule.rules ?? []), 0);
// Gets the document stylesheets of the page as page scripts see them, in alfa’s order.
const getPageSheets = (page) => page.evaluate(() => {
    // Counts the material rules in a list of rules, recording imports whose rules are unreadable.
    const countRules = (rules, unreadableImports) => {
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
                count += countRules(rule.cssRules, unreadableImports);
            }
        }
        return count;
    };
    // Alfa serializes the document sheets first and then the constructed (adopted) sheets.
    const sheets = [...Array.from(document.styleSheets), ...(document.adoptedStyleSheets ?? [])];
    return sheets.map((sheet, index) => {
        const unreadableImports = [];
        const sheetName = sheet.href
            || (sheet.ownerNode ? `inline sheet ${index}` : `constructed sheet ${index}`);
        const isCrossOrigin = !!sheet.href && new URL(sheet.href).origin !== location.origin;
        let ruleCount = null;
        try {
            ruleCount = countRules(sheet.cssRules, unreadableImports);
        }
        catch (error) { }
        return { sheet: sheetName, isCrossOrigin, ruleCount, unreadableImports };
    });
});
// Returns the hrefs of the @import rules of a stylesheet text.
const getImportHrefs = (text) => {
    // Erase comments, which can contain import-like text.
    let rest = text.replace(/\/\*[\s\S]*?\*\//g, ' ').trimStart();
    const hrefs = [];
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
/*
  Counts the material rules in the text of a stylesheet that page scripts cannot read, plus
  those of the stylesheets it validly imports, fetched relative to its URL. Each import rule
  counts as 1, as it does for page scripts; an imported sheet whose rules cannot be counted
  adds nothing more, so the count may be a minimum rather than the exact count.
*/
const countFetchedRules = async (page, url, visited = []) => {
    try {
        let text;
        // If the sheet is a local file (each file URL being an origin of its own):
        if (url.startsWith('file:')) {
            // Read it.
            text = await (0, promises_1.readFile)((0, url_1.fileURLToPath)(url), 'utf8');
        }
        // Otherwise, if the sheet is a data URL:
        else if (url.startsWith('data:')) {
            // Decode it.
            const commaIndex = url.indexOf(',');
            if (commaIndex === -1) {
                return null;
            }
            const payload = url.slice(commaIndex + 1);
            text = url.slice(5, commaIndex).endsWith(';base64')
                ? Buffer.from(payload, 'base64').toString('utf8')
                : decodeURIComponent(payload);
        }
        // Otherwise, if it is an HTTP resource:
        else if (url.startsWith('http')) {
            // Fetch it outside the page, where the cross-origin rule does not apply.
            const response = await page.request.get(url, { timeout: (0, config_1.applyMultiplier)(5000) });
            if (!response.ok()) {
                return null;
            }
            text = await response.text();
        }
        else {
            return null;
        }
        // Count its own material rules in a sheet constructed by the page, whose rules are readable.
        const ownCount = await page.evaluate(text => {
            const countRules = (rules) => {
                let count = 0;
                for (const rule of Array.from(rules)) {
                    if (rule instanceof CSSFontFaceRule || rule instanceof CSSPageRule) {
                        continue;
                    }
                    count++;
                    if ('cssRules' in rule) {
                        count += countRules(rule.cssRules);
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
        for (const href of importHrefs) {
            let importURL;
            try {
                importURL = new URL(href, url).href;
            }
            catch (error) {
                continue;
            }
            if (!visitedNext.includes(importURL)) {
                const importCount = await countFetchedRules(page, importURL, visitedNext);
                count += importCount ?? 0;
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
const getStyleLosses = async (page, alfaSheets) => {
    const losses = [];
    const pageSheets = await getPageSheets(page);
    const unreadableURLs = [];
    const emptyCrossOriginURLs = [];
    pageSheets.forEach((pageSheet, index) => {
        const { sheet, isCrossOrigin, ruleCount, unreadableImports } = pageSheet;
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
                losses.push({ sheet, reason: 'unserialized', ruleCount: ruleCount - alfaCount });
            }
        }
        unreadableURLs.push(...unreadableImports);
    });
    // For each sheet that page scripts cannot read:
    for (const url of unreadableURLs) {
        const ruleCount = await countFetchedRules(page, url);
        // If it has material rules or they could not be counted, report it.
        if (ruleCount !== 0) {
            losses.push({ sheet: url, reason: 'unreadable', ruleCount });
        }
    }
    // For each cross-origin sheet that seems empty:
    for (const url of emptyCrossOriginURLs) {
        const ruleCount = await countFetchedRules(page, url);
        // If its text has material rules, report it.
        if (ruleCount) {
            losses.push({ sheet: url, reason: 'unloaded', ruleCount });
        }
    }
    return losses;
};
// Conducts and reports the alfa tests.
const reporter = async (page, report, actIndex) => {
    const act = report.acts[actIndex];
    const { rules, reckless } = act;
    // If only some rules are to be employed:
    if (rules && rules.length) {
        // Remove the other rules.
        alfaRules = alfaRules.filter((rule) => rules.includes(rule.uri.replace(/^.+-/, '')));
    }
    // Initialize the act report.
    const data = {};
    const result = {
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
        result.standardResult = (0, standard_1.getStandardResult)();
    }
    try {
        try {
            // Wait for a stable page to make the page and its alfa version consistent.
            await page.waitForLoadState('networkidle', { timeout: (0, config_1.applyMultiplier)(9000) });
        }
        // If that fails:
        catch (error) {
            // Wait for the page to be loaded.
            await page.waitForLoadState('domcontentloaded', { timeout: (0, config_1.applyMultiplier)(6000) });
        }
        const doc = await page.evaluateHandle('document');
        // Get the alfa version of the page, first reloading cross-origin sheets with CORS where possible.
        const alfaPage = await Playwright.toPage(doc, { enforceAnonymousCrossOrigin: true });
        // Get the stylesheets whose material rules alfa did not receive.
        const styleLosses = await getStyleLosses(page, Array.from(alfaPage.document.style));
        // If there are any:
        if (styleLosses.length) {
            // Report them.
            data.styleLosses = styleLosses;
            // If the act does not permit testing a page with incomplete styles:
            if (!reckless) {
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
        const evaluations = Array.from(await audit.evaluate());
        const { nativeResult, standardResult } = result;
        // For each of them:
        for (const index in evaluations) {
            const evaluation = evaluations[index];
            const targetClass = evaluation.target;
            // If it has a non-collection violator:
            if (targetClass && !targetClass._members) {
                // Convert the evaluation to an element-specific item.
                const item = evaluation.toJSON();
                const { diagnostic, expectations, outcome, rule, target } = item;
                // If the outcome of the item is a failure or warning:
                if (['failed', 'cantTell'].includes(outcome)) {
                    // Delete typically massive properties unlikely to be useful.
                    delete target.children;
                    if (diagnostic?.errors) {
                        diagnostic.errors.forEach(error => {
                            delete error.element;
                            delete error.positionedDescendants;
                        });
                    }
                    // Increment the applicable total.
                    nativeResult.totals[outcome]++;
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
                        const { requirements, uri } = rule;
                        // Get the rule ID of the item.
                        const ruleID = uri.replace(/^.+-/, '');
                        // Get the rule description of the item.
                        let what = (expectations?.[0]?.[1]?.error?.message || '').trim().replace(/\s+/g, ' ');
                        if (!what) {
                            if (requirements && requirements.length && requirements[0].title) {
                                what = requirements[0].title;
                            }
                        }
                        // An untestable item keeps its rule ID; its outcome records the uncertainty. The
                        // contrast rules (r66, r69) cannot tell when a background needs human judgement.
                        const isCantTell = outcome === 'cantTell';
                        const xPath = (0, xPath_1.getNormalizedXPath)(item.path?.replace(/\/text\(\).*$/, '') || '/html');
                        // Add an instance to the standard instances.
                        (0, standard_1.addInstance)(standardResult, {
                            ruleID,
                            what,
                            ordinalSeverity: isCantTell ? 0 : 2,
                            outcome: isCantTell ? 'cantTell' : 'failed',
                            uncertainty: isCantTell && ['r66', 'r69'].includes(ruleID)
                                ? 'judgement-required'
                                : undefined,
                            catalogIndex: (0, xPath_1.getXPathCatalogIndex)(report, xPath)
                        });
                    }
                }
            }
        }
        ;
    }
    catch (error) {
        data.prevented = true;
        const { message } = error;
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
exports.reporter = reporter;
