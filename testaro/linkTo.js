"use strict";
/*
  © 2023 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
// IMPORTS
Object.defineProperty(exports, "__esModule", { value: true });
exports.reporter = void 0;
const testaro_1 = require("../procs/testaro");
/*
  linkTo
  This test reports links without href attributes.
  Compiled to linkTo.js by tsc (issue #73); edit this file, not the emitted one.
*/
// FUNCTIONS
// Runs the test and returns the result.
const reporter = async (page, report, _, withItems) => {
    const getBadWhat = element => {
        const isVisible = element.checkVisibility({
            contentVisibilityAuto: true,
            opacityProperty: true,
            visibilityProperty: true
        });
        // If the element is visible:
        if (isVisible) {
            // Return a violation description.
            return `Element has no href attribute`;
        }
    };
    const whats = 'Links are missing href attributes';
    return await (0, testaro_1.doTest)(page, report, withItems, 'linkTo', 'body a:not([href]', whats, 2, getBadWhat.toString());
};
exports.reporter = reporter;
