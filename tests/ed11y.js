"use strict";
/*
  © 2023–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

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
  ed11y
  Implements the Editoria11y ruleset for accessibility.
  Compiled to ed11y.js by tsc (issue #73); edit this file, not the emitted one.
*/
// FUNCTIONS
// Performs and reports the Editoria11y tests.
const reporter = async (page, report, actIndex) => {
    // Get the nonce, if any.
    const act = report.acts[actIndex];
    const { jobData } = report;
    const scriptNonce = (jobData && jobData.lastScriptNonce);
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
    // Get the tool script.
    const script = await fs.readFile(`${__dirname}/../ed11y/editoria11y.min.js`, 'utf8');
    // Perform the specified tests and populate the native result.
    result.nativeResult = await page.evaluate(args => new Promise(async (resolve) => {
        const { scriptNonce, script, rulesToTest } = args;
        // When the script has been executed, creating data in an Ed11y object:
        document.addEventListener('ed11yResults', async () => {
            let { results } = Ed11y;
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
        catch (error) {
            resolve({
                prevented: true,
                error: error.message
            });
        }
        ;
    }), {
        scriptNonce,
        script,
        rulesToTest: act.rules
    });
    // If the tool script failed to run:
    if (result.nativeResult.prevented) {
        // Report the prevention.
        data.prevented = true;
        data.error = result.nativeResult.error;
        if (standard) {
            result.standardResult.prevented = true;
        }
    }
    // Otherwise, i.e. if it ran, and if a standard result is to be reported:
    else if (standard) {
        const { standardResult } = result;
        const { warningCount, errorCount, results } = result.nativeResult;
        // Populate the standard-result totals.
        standardResult.totals = [warningCount, 0, errorCount, 0];
        // For each native-result instance:
        results.forEach(nativeInstance => {
            // Create a standard-result instance.
            const { test, content, dismissalKey, xPath } = nativeInstance;
            // A dismissable warning is a manual check.
            (0, standard_1.pushInstance)(standardResult, {
                ruleID: test,
                what: content,
                ordinalSeverity: dismissalKey ? 0 : 2,
                outcome: dismissalKey ? 'cantTell' : 'failed',
                uncertainty: dismissalKey ? 'judgement-required' : undefined,
                catalogIndex: (0, xPath_1.getXPathCatalogIndex)(report, xPath)
            });
        });
    }
    return {
        data,
        result
    };
};
exports.reporter = reporter;
