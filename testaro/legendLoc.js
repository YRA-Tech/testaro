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
  legendLoc
  Clean-room rule.
  This test reports legend elements that are not the first children of fieldset elements.
  Compiled to legendLoc.js by tsc (issue #73); edit this file, not the emitted one.
*/
// FUNCTIONS
// Runs the test and returns the result.
const reporter = async (page, report, _, withItems) => {
    const getBadWhat = element => {
        const parent = element.parentElement;
        // If the element violates the rule:
        if (!(parent && parent.tagName === 'FIELDSET' && parent.firstElementChild === element)) {
            // Return a violation description.
            return 'Element is not the first child of a fieldset element';
        }
    };
    const whats = 'Legend elements are not the first children of fieldset elements';
    return await (0, testaro_1.doTest)(page, report, withItems, 'legendLoc', 'body legend', whats, 3, getBadWhat.toString());
};
exports.reporter = reporter;
