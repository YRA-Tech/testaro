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
// CONSTANTS
// The browser's rule class of each rule type of Alfa's page reader.
const ruleClasses = {
    'font-face': 'CSSFontFaceRule',
    import: 'CSSImportRule',
    keyframe: 'CSSKeyframeRule',
    keyframes: 'CSSKeyframesRule',
    'layer-block': 'CSSLayerBlockRule',
    'layer-statement': 'CSSLayerStatementRule',
    media: 'CSSMediaRule',
    namespace: 'CSSNamespaceRule',
    page: 'CSSPageRule',
    style: 'CSSStyleRule',
    supports: 'CSSSupportsRule'
};
// FUNCTIONS
/*
  Counts, in the page, the rules of each style sheet of the document, by rule type, as Alfa's
  page reader lists the sheets: document.styleSheets, then document.adoptedStyleSheets. The rules
  of grouping rules (@media, @container, …), of style rules (nesting), and of imported sheets are
  counted with them. Runs in the page, so it refers to nothing outside itself.
*/
const getBrowserSheets = () => {
    const sheets = [
        ...Array.from(document.styleSheets),
        ...(document.adoptedStyleSheets ?? [])
    ];
    let inlineIndex = 0;
    let adoptedIndex = 0;
    return sheets.map(sheet => {
        const owner = sheet.ownerNode;
        const name = sheet.href
            || (owner ? `inline <${owner.tagName.toLowerCase()}> ${inlineIndex++}` : `adopted ${adoptedIndex++}`);
        const counts = {};
        const unreadableImports = [];
        const tally = (rules) => {
            for (const rule of Array.from(rules)) {
                const ruleClass = rule.constructor.name;
                counts[ruleClass] = (counts[ruleClass] ?? 0) + 1;
                const imported = rule.styleSheet;
                if (ruleClass === 'CSSImportRule' && imported) {
                    try {
                        tally(imported.cssRules);
                    }
                    catch (error) {
                        unreadableImports.push(rule.href);
                    }
                }
                const children = rule.cssRules;
                if (children) {
                    tally(children);
                }
            }
        };
        try {
            tally(sheet.cssRules);
        }
        catch (error) {
            return { sheet: name, counts: null, unreadableImports };
        }
        return { sheet: name, counts, unreadableImports };
    });
};
// Counts the rules of the JSON of a sheet of Alfa's page, by browser rule class.
const countAlfaRules = (rules, counts) => {
    for (const rule of rules) {
        const ruleClass = ruleClasses[rule.type] ?? rule.type;
        counts[ruleClass] = (counts[ruleClass] ?? 0) + 1;
        if (Array.isArray(rule.rules)) {
            countAlfaRules(rule.rules, counts);
        }
    }
    return counts;
};
/*
  Returns what Alfa did not see of the document's style sheets: for each sheet the page can read,
  the rules of each type it holds beyond those Alfa received, and the sheets nobody can read.
  Alfa's page reader (alfa-dom 0.120.0) gives no rules for a whole sheet that contains one rule of
  a type it does not serialise, such as @container or @property (Siteimprove/alfa#2188), and none
  for rules nested in style rules (Siteimprove/alfa#1752). Sheets in shadow trees are not counted.
*/
const getStyleLosses = (browserSheets, alfaSheets) => {
    const styleLosses = {
        sheets: browserSheets.length,
        losses: [],
        lostRules: 0,
        unreadable: []
    };
    browserSheets.forEach(({ sheet, counts, unreadableImports }, index) => {
        styleLosses.unreadable.push(...unreadableImports);
        if (!counts) {
            styleLosses.unreadable.push(sheet);
            return;
        }
        const alfaCounts = countAlfaRules((alfaSheets[index]?.rules ?? []), {});
        const lostRules = {};
        let browserRules = 0;
        let alfaRules = 0;
        let lost = 0;
        for (const [ruleClass, count] of Object.entries(counts)) {
            browserRules += count;
            const alfaCount = alfaCounts[ruleClass] ?? 0;
            if (alfaCount < count) {
                lostRules[ruleClass] = count - alfaCount;
                lost += count - alfaCount;
            }
        }
        for (const count of Object.values(alfaCounts)) {
            alfaRules += count;
        }
        if (lost) {
            styleLosses.losses.push({ sheet, browserRules, alfaRules, lostRules });
            styleLosses.lostRules += lost;
        }
    });
    return styleLosses;
};
// Conducts and reports the alfa tests.
const reporter = async (page, report, actIndex) => {
    const act = report.acts[actIndex];
    const { rules } = act;
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
        const alfaPage = await Playwright.toPage(doc);
        /*
          Record the styles Alfa did not see, so that a consumer can tell how far its results reflect
          the page's styles. The act is not prevented: Alfa's results stand, as before.
        */
        try {
            const browserSheets = await page.evaluate(getBrowserSheets);
            const alfaSheets = [...alfaPage.document.style].map((sheet) => sheet.toJSON());
            const styleLosses = getStyleLosses(browserSheets, alfaSheets);
            if (styleLosses.losses.length || styleLosses.unreadable.length) {
                data.styleLosses = styleLosses;
            }
        }
        catch (error) {
            data.styleLossesError = error.message;
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
