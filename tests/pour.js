"use strict";
/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.reporter = void 0;
// IMPORTS
const fs = __importStar(require("fs/promises"));
const xPath_1 = require("../procs/xPath");
const standard_1 = require("../procs/standard");
/*
  pour
  Implements the Pour Engine (https://github.com/pourdev/pour-engine) WCAG 2.2 ruleset.
  Compiled to pour.js by tsc (issue #73); edit this file, not the emitted one.

  Pour ships as ES modules with no dist build, so a vendored IIFE bundle is expected at
  ../pour/pour.min.js, exposing a `pourEngine` global with {run, name, version}. See
  ../pour/README.md for the build command and the pinned upstream commit.

  Instance policy (engine-candidacy-pipeline.md, Stage 1): `violations` become instances with
  outcome `failed` at ordinalSeverity 2-3; `incomplete` become instances with outcome `cantTell`
  at 0-1; `passes`, `inapplicable`, and `manualReview` are tallied in `data` only and never
  become instances.
*/
// CONSTANTS
// Severity weights within a certainty band, mirroring tests/axe.ts.
const severityWeights = {
    minor: 0,
    moderate: 0,
    serious: 1,
    critical: 1
};
// FUNCTIONS
// Performs and reports the Pour Engine tests.
const reporter = async (page, report, actIndex) => {
    const act = report.acts[actIndex];
    // Initialize the act report.
    let data = {};
    const result = {
        nativeResult: {},
        standardResult: {}
    };
    const standard = report.standard !== 'no';
    // If standard results are to be reported:
    if (standard) {
        // Initialize the standard result.
        result.standardResult = (0, standard_1.getStandardResult)();
    }
    // Get the vendored tool bundle.
    let script;
    try {
        script = await fs.readFile(`${__dirname}/../pour/pour.min.js`, 'utf8');
    }
    catch (error) {
        data.prevented = true;
        data.error = 'ERROR: pour bundle missing (see pour/README.md for vendoring instructions)';
        return { data, result };
    }
    try {
        /*
          Run the tool bundle in the page. A script element would be refused by a page whose content
          security policy forbids inline scripts, so the script is instead evaluated in the page,
          which no such policy prevents.
        */
        await page.evaluate(`${script}\n;void 0;`);
    }
    // If the bundle failed to run:
    catch (error) {
        // Report the prevention.
        data.prevented = true;
        data.error = `pour bundle failed to run (${error.message.slice(0, 200)})`;
        if (standard) {
            result.standardResult.prevented = true;
        }
        return { data, result };
    }
    // Perform the tests and populate the native result.
    result.nativeResult = await page.evaluate(args => new Promise(async (resolve) => {
        const { scriptChars } = args;
        // If the bundle failed to define its global:
        if (typeof pourEngine === 'undefined' || typeof pourEngine.run !== 'function') {
            resolve({
                prevented: true,
                error: `pourEngine global not defined (contentType ${document.contentType}, `
                    + `scriptChars ${scriptChars}, readyState ${document.readyState})`
            });
            return;
        }
        try {
            // Run the engine on the top document. An empty tag selection runs every
            // rule (all WCAG levels incl. AAA, plus pour's best-practice extras) —
            // matching the axe adapter's kitchen-sink default; testilo's taxonomy
            // decides per rule what counts downstream.
            const pourReport = await pourEngine.run(document, {});
            // Normalizes one certainty bucket (axe-style rule entries) to flat per-element findings.
            const flatten = (bucket) => (bucket || [])
                .flatMap(entry => {
                // Criterion tag (e.g. wcag143) → dotted criterion (1.4.3).
                const criterionTag = (entry.tags || []).find(tag => /^wcag\d{3,4}$/.test(tag));
                const digits = criterionTag ? criterionTag.slice(4) : '';
                const wcag = digits ? `${digits[0]}.${digits[1]}.${digits.slice(2)}` : '';
                return (entry.nodes || []).map(node => {
                    const cssPath = Array.isArray(node.target) ? node.target[0] : '';
                    let xPath = '';
                    try {
                        const element = cssPath && document.querySelector(cssPath);
                        if (element && typeof window.getXPath === 'function') {
                            xPath = window.getXPath(element) ?? '';
                        }
                    }
                    catch (error) {
                        // Unresolvable path: instance falls back to excerpt only.
                    }
                    return {
                        ruleID: entry.id || '',
                        what: (entry.help || '').replace(/\s+/g, ' ').trim(),
                        wcag,
                        severity: (entry.impact || 'moderate').toLowerCase(),
                        html: (node.html || '').slice(0, 500),
                        cssPath,
                        xPath
                    };
                });
            });
            resolve({
                engineVersion: pourReport.testEngine && pourReport.testEngine.version || '',
                violations: flatten(pourReport.violations),
                incomplete: flatten(pourReport.incomplete),
                // Tallied only; never instances. Passes serialize no nodes upstream;
                // nodeCount carries the per-rule passing-element total.
                passRuleCount: (pourReport.passes || []).length,
                passElementCount: (pourReport.passes || [])
                    .reduce((total, entry) => total + (entry.nodeCount || 0), 0),
                inapplicableRuleCount: (pourReport.inapplicable || []).length,
                manualReviewCriterionCount: (pourReport.manualReview || []).length
            });
        }
        catch (error) {
            resolve({
                prevented: true,
                error: error.message
            });
        }
        ;
    }), {
        scriptChars: script.length
    });
    const { nativeResult } = result;
    // If the tool ran and rules were selected:
    if (!nativeResult.prevented && act.rules) {
        // Remove results of other rules.
        const { rules } = act;
        nativeResult.violations = (nativeResult.violations || [])
            .filter(finding => rules.includes(finding.ruleID));
        nativeResult.incomplete = (nativeResult.incomplete || [])
            .filter(finding => rules.includes(finding.ruleID));
    }
    // If the tool was prevented from running:
    if (nativeResult.prevented) {
        data.prevented = true;
        data.error = nativeResult.error;
    }
    // Otherwise, if a standard result is to be reported:
    else if (standard) {
        const { standardResult } = result;
        // Record the tallied-only bucket sizes.
        data.passRuleCount = nativeResult.passRuleCount;
        data.passElementCount = nativeResult.passElementCount;
        data.inapplicableRuleCount = nativeResult.inapplicableRuleCount;
        data.manualReviewCriterionCount = nativeResult.manualReviewCriterionCount;
        // For each certainty band:
        const bands = [
            [nativeResult.incomplete || [], 0, 'cantTell'],
            [nativeResult.violations || [], 2, 'failed']
        ];
        bands.forEach(([findings, baseSeverity, outcome]) => {
            // For each native-result finding:
            findings.forEach(finding => {
                // Add a standard-result instance.
                const { ruleID, what, severity, xPath } = finding;
                (0, standard_1.addInstance)(standardResult, {
                    ruleID,
                    what,
                    ordinalSeverity: baseSeverity + (severityWeights[severity] ?? 0),
                    outcome,
                    catalogIndex: (0, xPath_1.getXPathCatalogIndex)(report, xPath)
                });
            });
        });
    }
    return {
        data,
        result
    };
};
exports.reporter = reporter;
