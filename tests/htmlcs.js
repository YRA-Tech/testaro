"use strict";
/*
  © 2022–2024 CVS Health and/or one of its affiliates. All rights reserved.
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
/*
  htmlcs
  Implements the HTML CodeSniffer ruleset.
  Compiled to htmlcs.js by tsc (issue #73); edit this file, not the emitted one.
*/
// FUNCTIONS
// Conducts and reports the HTML CodeSniffer tests.
const reporter = async (page, report, actIndex) => {
    const act = report.acts[actIndex];
    const { rules } = act;
    // Initialize the act report.
    const data = {};
    const result = {
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
        result.standardResult = {
            prevented: false,
            totals: [0, 0, 0, 0],
            instances: []
        };
    }
    const { nativeResult, standardResult } = result;
    // Get the HTMLCS script.
    const scriptText = await fs.readFile(`${__dirname}/../htmlcs/HTMLCS.js`, 'utf8');
    const scriptNonce = (report.jobData && report.jobData.lastScriptNonce);
    let messageStrings = [];
    // For each class of standards to  be tested for:
    for (const actStandard of ['WCAG2AAA']) {
        const nextViolations = await page.evaluate(args => {
            const actStandard = args[0];
            const rules = args[1];
            const scriptText = args[2];
            const scriptNonce = args[3];
            const script = document.createElement('script');
            script.nonce = scriptNonce;
            script.textContent = scriptText;
            // HTMLCS.js is a UMD bundle. If the page exposes an AMD loader (define.amd, e.g. Wix or RequireJS) or leaked CommonJS globals (exports, module), the UMD wrapper registers HTMLCS as a module and never attaches HTMLCS_RUNNER to window, so the run() call below throws and the tool is reported prevented. Hide those loader globals for the duration of the synchronous script execution, so the wrapper falls through to its browser-global branch.
            const umdDefine = window.define;
            const umdExports = window.exports;
            const umdModule = window.module;
            window.define = undefined;
            window.exports = undefined;
            // The cast erases; window.module otherwise types as Node's module global.
            window.module = undefined;
            // Add the HTMLCS script to the page.
            document.head.insertAdjacentElement('beforeend', script);
            // Restore the loader globals.
            window.define = umdDefine;
            window.exports = umdExports;
            window.module = umdModule;
            // If only some rules are to be employed:
            if (rules && Array.isArray(rules) && rules.length) {
                // Redefine WCAG 2 AAA as including only them.
                if (!window.HTMLCS_WCAG2AAA) {
                    window.HTMLCS_WCAG2AAA = {};
                }
                window.HTMLCS_WCAG2AAA.sniffs = rules;
            }
            let violations = null;
            // Run the tests.
            try {
                violations = window.HTMLCS_RUNNER.run(actStandard);
            }
            catch (error) {
                console.log(`ERROR executing HTMLCS_RUNNER on ${document.URL} (${error.message})`);
            }
            // Return the reported violations of that standard.
            return violations;
        }, [actStandard, rules, scriptText, scriptNonce]);
        // If all reported violations of the standard are validly described:
        if (nextViolations?.every(violation => typeof violation === 'string')) {
            // Add their descriptions to the violation descriptions.
            messageStrings.push(...nextViolations);
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
    if (!data.prevented) {
        // Sort the violations by class and standard.
        messageStrings.sort();
        // Remove any duplicate violations.
        messageStrings = [...new Set(messageStrings)];
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
                const xPath = (0, xPath_1.getAttributeXPath)(parts[5]);
                const instance = {
                    ruleID: `${parts[0][0]}-${parts[1]}`,
                    what: parts[4],
                    ordinalSeverity: parts[0] === 'Warning' ? 0 : 2,
                    count: 1,
                    catalogIndex: (0, xPath_1.getXPathCatalogIndex)(report, xPath)
                };
                standardResult.instances.push(instance);
            }
        }
        standardResult.totals[0] = nativeResult.totals.cantTell;
        standardResult.totals[2] = nativeResult.totals.failed;
    }
    return {
        data,
        result
    };
};
exports.reporter = reporter;
