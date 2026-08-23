"use strict";
/*
  © 2022–2023 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.reporter = void 0;
const testaro_1 = require("../procs/testaro");
/*
  nonTable
  Derived from the bbc-a11y useTablesForData test. Crude heuristics omitted.
  This test reports tables used for layout.
  Compiled to nonTable.js by tsc (issue #73); edit this file, not the emitted one.
*/
// FUNCTIONS
// Runs the test and returns the result.
const reporter = async (page, report, _, withItems) => {
    // The candidate selector yields table elements.
    const getBadWhat = (element) => {
        // If the element contains another table:
        if (element.querySelector('table')) {
            // Return a violation description.
            return 'Element contains another table';
        }
        const rowCount = element.querySelectorAll('tr').length;
        const columnCount = Math.max(...Array
            .from(element.querySelectorAll('tr'))
            .map(row => Array.from(row.querySelectorAll('th, td')).length));
        // Otherwise, if it has only 1 column or 1 row:
        if (rowCount === 1 || columnCount === 1) {
            // Return a violation description.
            return 'Element has only one row or one column';
        }
        // Otherwise, if it contains an object or player:
        if (element.querySelector('object, embed, applet, audio, video')) {
            // Return a violation description.
            return 'Element contains an object or player';
        }
        const role = element.getAttribute('role');
        // Otherwise, if it has no table-compatible explicit role or descendant element:
        if (!(['grid', 'treegrid'].includes(role)
            || element.caption
            || element.querySelector('col, colgroup, tfoot, th, thead'))) {
            // Return a violation description.
            return 'Element has no table-compatible explicit role or descendant element';
        }
    };
    const whats = 'table elements are misused for non-table content';
    return await (0, testaro_1.doTest)(page, report, withItems, 'nonTable', 'body table', whats, 2, getBadWhat.toString());
};
exports.reporter = reporter;
