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
const path = __importStar(require("path"));
const nu_1 = require("../procs/nu");
const xPath_1 = require("../procs/xPath");
const standard_1 = require("../procs/standard");
// vnu-jar ships no type declarations, so its import stays a require and is untyped.
const { vnu } = require('vnu-jar');
/*
  nuVnu
  Subjects a page and its source to the Nu Html Checker, thereby testing scripted content found only in the loaded page and erroneous content before the browser corrects it. The API erratically replaces left and right double quotation marks with invalid UTF-8, which appears as 2 or 3 successive instances of the replacement character (U+fffd). Therefore, this test removes all such quotation marks and the replacement character. That causes 'Bad value “” for' to become 'Bad value  for'. Since the corruption of quotation marks is erratic, no better solution is known.
  This rule engine is the installed version of the Nu Html Checker. It is an alternative to the nuVal rule engine, which uses the same validator as a web service of the World Wide Web Consortium (W3C). Each rule engine has advantages and disadvantages. The main advantage of the nuVnu rule engine is that it can evaluate pages larger than about 80,000 bytes and pages reachable from the host that Testaro runs on even if not reachable from the public Internet. The main advantages of nuVal are that it usually runs faster than nuVnu and it does not require the Testaro host to provide a Java virtual machine.
  When both nuVal and nuVnu are included in a job, nuVal should precede nuVnu. If nuVal succeeds, nuVnu aborts. So, only one of the two tools contributes instances to the job report.
  Compiled to nuVnu.js by tsc (issue #73); edit this file, not the emitted one.
*/
// FUNCTIONS
// Conducts and reports the Nu Html Checker tests.
const reporter = async (page, report, actIndex) => {
    // Initialize the act report.
    const data = {};
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
    const { standardResult } = result;
    // Get the nuVal act, if it exists.
    const nuValAct = report.acts.find(act => act.type === 'test' && act.which === 'nuVal');
    // If it does not exist or it exists but was prevented:
    if (!nuValAct || nuValAct.data?.prevented) {
        const act = report.acts[actIndex];
        const { rules, withSource } = act;
        // Get the content.
        const content = await (0, nu_1.getContent)(page, withSource);
        const { testTarget } = content;
        // If it was obtained and contains a test target:
        if (testTarget) {
            const pagePath = path.join(report.jobData.tmpDir, 'nuVnu-page.html');
            // Save the test target in a temporary file.
            await fs.writeFile(pagePath, testTarget);
            let nuData;
            try {
                // Get Nu Html Checker output on it.
                nuData = await vnu.check(['--format', 'json', '--stdout', pagePath]);
            }
            // If any error was thrown:
            catch (error) {
                const errorMessage = error.message;
                try {
                    // Parse it as JSON, i.e. a benign nuVnu result with at least 1 violation.
                    nuData = JSON.parse(error.message);
                }
                // If parsing it as JSON fails:
                catch (error) {
                    // Report a genuine error.
                    data.prevented = true;
                    data.error = errorMessage;
                }
            }
            // Delete the temporary file.
            await fs.unlink(pagePath);
            // Postprocess the output and add the postprocessed output to the native result.
            result.nativeResult = await (0, nu_1.curate)(data, nuData, rules);
            // If standard results are to be reported:
            if (standard) {
                // For each message in the native result:
                result.nativeResult.messages.forEach(message => {
                    const isInfo = message.type === 'info';
                    // Initialize a standard instance. Informational messages are uncertainty.
                    const standardInstance = {
                        ruleID: message.message,
                        what: message.message,
                        ordinalSeverity: isInfo ? 0 : 3,
                        outcome: isInfo ? 'cantTell' : 'failed'
                    };
                    // Get the XPath of the element from its extract.
                    const xPath = (0, xPath_1.getAttributeXPath)(message.extract);
                    // If the acquisition succeeded:
                    if (xPath) {
                        // Add the catalog index to the standard instance.
                        standardInstance.catalogIndex = (0, xPath_1.getXPathCatalogIndex)(report, xPath);
                    }
                    // Get an excerpt of the extract, if the extract identifies no element.
                    const extractExcerpt = (0, nu_1.getExtractExcerpt)(message.extract);
                    // If one was obtained (e.g. the erroneous CSS of a CSS: Parse Error message):
                    if (extractExcerpt) {
                        // Add it to the description of the violation, so the extract is not lost.
                        standardInstance.what = `${message.message} Extract: ${extractExcerpt}`;
                    }
                    // Add the standard instance to the standard result.
                    (0, standard_1.addInstance)(standardResult, standardInstance);
                });
            }
        }
        // Otherwise, i.e. if the content was not obtained or contains no test target:
        else {
            // Report this.
            data.prevented = true;
            data.error = 'Content not obtained';
        }
    }
    // Otherwise, i.e. if the nuVal act exists and succeeded:
    else {
        // Abort this act and report this.
        data.skipped = true;
        data.reason = 'nuVal succeeded';
    }
    // Return the data and result.
    return {
        data,
        result
    };
};
exports.reporter = reporter;
