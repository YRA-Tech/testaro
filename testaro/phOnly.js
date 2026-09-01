"use strict";
/*
  © 2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2025 Juan S. Casado.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.reporter = void 0;
const testaro_1 = require("../procs/testaro");
/*
  phOnly
  Clean-room rule.
  This test reports input elements that have placeholders but no accessible names. The standard for accessible name computation is employed; it accepts title attributes as sources for accessible names. Thus, this test does not report reliance on title attributes for accessible names, although such reliance is generally considered a poor practice.
  Compiled to phOnly.js by tsc (issue #73); edit this file, not the emitted one.
*/
// FUNCTIONS
// Runs the test and returns the result.
const reporter = async (page, report, _, withItems) => {
    const getBadWhat = element => {
        // Get the accessible name of the element.
        const accessibleName = window.getAccessibleName(element);
        // If there is none:
        if (!accessibleName) {
            // Return a violation description.
            return 'Element has a placeholder but no accessible name';
        }
    };
    const whats = 'input elements have placeholders but no accessible names';
    return await (0, testaro_1.doTest)(page, report, withItems, 'phOnly', 'body input[placeholder]', whats, 2, getBadWhat.toString());
};
exports.reporter = reporter;
