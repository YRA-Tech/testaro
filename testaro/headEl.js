"use strict";
/*
  © 2023–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or   https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.reporter = void 0;
const xPath_1 = require("../procs/xPath");
/*
  headEl
  Related to ASLint rule elements-not-allowed-in-head.
  This test reports invalid descendants of the head of the document. Compiled to headEl.js by
  tsc (issue #73); edit this file, not the emitted one.
*/
// ########## FUNCTIONS
// Runs the test and returns the result.
const reporter = async (page, report) => {
    // Initialize the data and standard result.
    const data = {
        total: 0,
        badTagNames: []
    };
    let totals = [];
    const standardInstances = [];
    // Get the tag names of the elements in the head, even if the head tags are omitted.
    const headElTagNames = await page.evaluate(() => {
        const head = document.head;
        const headChildren = head.children;
        const tagNames = [];
        for (const child of headChildren) {
            tagNames.push(child.tagName);
        }
        return tagNames;
    });
    const validTagNames = [
        'BASE',
        'LINK',
        'META',
        'SCRIPT',
        'STYLE',
        'TITLE',
        'NOSCRIPT',
        'TEMPLATE'
    ];
    // For each head child:
    headElTagNames.forEach(tagName => {
        // If it is invalid:
        if (!validTagNames.includes(tagName)) {
            // Add its tag name to the result.
            data.total++;
            data.badTagNames.push(tagName);
        }
    });
    // If there are any instances:
    if (data.total) {
        // Add a summary instance to the standard instances.
        standardInstances.push({
            ruleID: 'headEl',
            what: `Invalid elements within the head: ${data.badTagNames.join(', ')}`,
            ordinalSeverity: 2,
            count: data.total,
            catalogIndex: (0, xPath_1.getXPathCatalogIndex)(report, '/html/head')
        });
    }
    totals = [0, 0, data.total, 0];
    // Return the data.
    return {
        data,
        totals,
        standardInstances
    };
};
exports.reporter = reporter;
