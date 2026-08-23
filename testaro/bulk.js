"use strict";
/*
  © 2021–2023 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.reporter = void 0;
const xPath_1 = require("../procs/xPath");
/*
  bulk
  This test reports the count of visible elements. The test assumes that simplicity and compactness, with one page having one purpose, is an accessibility virtue. Users with visual, motor, and cognitive disabilities often have trouble finding what they want or understanding the purpose of a page if the page is cluttered with content.
  Compiled to bulk.js by tsc (issue #73); edit this file, not the emitted one.
*/
// FUNCTIONS
// Runs the test and returns the result.
const reporter = async (page, report) => {
    // Get a count of elements deemed visible by Playwright.
    const visibleElementCount = await page.locator('body :visible').count();
    // Convert the count to a severity level, treating up to 400 as non-reportable.
    const severity = Math.min(4, Math.round(visibleElementCount / 400)) - 1;
    const totals = [0, 0, 0, 0];
    // If the severity is reportable:
    if (severity > -1) {
        totals[severity] = 1;
        // Return data, totals, and a summary standard instance.
        return {
            data: {},
            totals,
            standardInstances: [{
                    ruleID: 'bulk',
                    what: `Page contains ${visibleElementCount} visible elements`,
                    ordinalSeverity: severity,
                    count: 1,
                    catalogIndex: (0, xPath_1.getXPathCatalogIndex)(report, '/html')
                }]
        };
    }
    // Otherwise, return data, totals, and an empty array of standard instances.
    return {
        data: {},
        totals,
        standardInstances: []
    };
};
exports.reporter = reporter;
