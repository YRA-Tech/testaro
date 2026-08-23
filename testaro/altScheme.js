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
  altScheme
  This test reports img elements whose alt attributes are URLs or file names. Compiled to
  altScheme.js by tsc (issue #73); edit this file, not the emitted one.
*/
// FUNCTIONS
// Runs the test and returns the result.
const reporter = async (page, report, _, withItems) => {
    const getBadWhat = element => {
        // Get the value of the alt attribute of the element.
        const alt = (element.getAttribute('alt') || '').trim();
        // If it is non-empty:
        if (alt) {
            const isURL = /^(?:https?:|file:|ftp:)\S+$/i.test(alt);
            const isFileName = /favicon|^\S+\.(?:png|jpe?g|gif|svg|webp|ico)$/i.test(alt);
            // If it is a URL or file name:
            if (isURL || isFileName) {
                const valueType = isURL && isFileName
                    ? 'the URL of an image file'
                    : (isURL ? 'a URL' : 'a file name');
                // Return a violation description.
                return `img element has an alt attribute with ${valueType} as its value`;
            }
        }
    };
    const whats = 'img elements have alt attributes with URL or filename values';
    return await (0, testaro_1.doTest)(page, report, withItems, 'altScheme', 'body img[alt]', whats, 1, getBadWhat.toString());
};
exports.reporter = reporter;
