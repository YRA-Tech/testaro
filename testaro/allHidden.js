"use strict";
/*
  © 2023 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.reporter = void 0;
const xPath_1 = require("../procs/xPath");
/*
  allHidden
  This test reports a page that is entirely or mainly hidden. Compiled to allHidden.js by tsc
  (issue #73); edit this file, not the emitted one.
*/
// FUNCTIONS
// Runs the test and returns the result.
const reporter = async (page, report) => {
    // Get a count of elements deemed visible by Playwright.
    const visibleElementCount = await page.locator('body :visible').count();
    // If no element is visible:
    if (!visibleElementCount) {
        // Return data, totals, and a summary standard instance.
        return {
            data: {},
            totals: [0, 0, 0, 1],
            standardInstances: [{
                    ruleID: 'allHidden',
                    what: 'The entire page body is hidden or empty',
                    ordinalSeverity: 3,
                    count: 1,
                    catalogIndex: (0, xPath_1.getXPathCatalogIndex)(report, '/html/body')
                }]
        };
    }
    // Otherwise, return data, totals, and an empty array of standard instances.
    return {
        data: {},
        totals: [0, 0, 0, 0],
        standardInstances: []
    };
};
exports.reporter = reporter;
