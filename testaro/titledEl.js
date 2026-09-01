"use strict";
/*
  © 2023–2025 CVS Health and/or one of its affiliates. All rights reserved.
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
  titledEl
  This test reports suspicious use of title attributes.
  Compiled to titledEl.js by tsc (issue #73); edit this file, not the emitted one.
*/
// FUNCTIONS
// Runs the test and returns the result.
const reporter = async (page, report, _, withItems) => {
    const getBadWhat = element => {
        const elementType = element.tagName.toLowerCase();
        // Return a violation description.
        return `Likely ineffective title attribute is used on the ${elementType} element`;
    };
    const selector = 'body [title]:not(iframe, link, style)';
    const whats = 'title attributes are used on elements they are likely ineffective on';
    return await (0, testaro_1.doTest)(page, report, withItems, 'titledEl', selector, whats, 0, getBadWhat.toString());
};
exports.reporter = reporter;
