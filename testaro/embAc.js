"use strict";
/*
  © 2021–2023 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.reporter = void 0;
const testaro_1 = require("../procs/testaro");
/*
  embAc
  This test reports interactive elements (links, buttons, inputs, and select lists) contained by links or buttons. Such embedding not only violates the HTML standard, but also complicates user interaction and creates risks of error. It becomes non-obvious what a user will activate with a click.
  Compiled to embAc.js by tsc (issue #73); edit this file, not the emitted one.
*/
// FUNCTIONS
// Runs the test and returns the result.
const reporter = async (page, report, _, withItems) => {
    const getBadWhat = element => {
        // Get whether the embedding element is a link or a button.
        const embedder = element.parentElement.closest('a, button');
        const embedderWhat = embedder.tagName.toLowerCase() === 'a' ? 'a link' : 'a button';
        // Return a violation description.
        return `interactive element is embedded in ${embedderWhat}`;
    };
    const selector = ['a', 'button', 'input', 'select']
        .map(tag => `a ${tag}, button ${tag}`)
        .join(', ');
    const whats = 'interactive elements are embedded in links or buttons';
    return await (0, testaro_1.doTest)(page, report, withItems, 'embAc', selector, whats, 2, getBadWhat.toString());
};
exports.reporter = reporter;
