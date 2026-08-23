"use strict";
/*
  © 2022–2023 CVS Health and/or one of its affiliates. All rights reserved.
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
  miniText
  Derived from the bbc-a11y textCannotBeTooSmall test.
  Related to Tenon rule 134.
  This test reports elements with font sizes smaller than 11 pixels.
  Compiled to miniText.js by tsc (issue #73); edit this file, not the emitted one.
*/
// FUNCTIONS
// Runs the test and returns the result.
const reporter = async (page, report, _, withItems) => {
    const getBadWhat = element => {
        const rawText = element.textContent || '';
        // If the element has text content with any non-whitespace:
        if (/[^\s]/.test(rawText)) {
            const isVisible = element.checkVisibility({
                contentVisibilityAuto: true,
                opacityProperty: true,
                visibilityProperty: true
            });
            // If the element is visible:
            if (isVisible) {
                const styleDec = window.getComputedStyle(element);
                // Get its font size.
                const fontSizeString = styleDec.fontSize;
                const fontSize = Number.parseFloat(fontSizeString);
                // If its font size is smaller than 11 pixels:
                if (fontSize < 11) {
                    const parent = element.parentElement;
                    // If the element has a parent:
                    if (parent) {
                        const parentStyleDec = window.getComputedStyle(parent);
                        const parentFontSize = Number.parseFloat(parentStyleDec.fontSize);
                        // If the parent also has a font size smaller than 11 pixels:
                        if (parentFontSize < 11) {
                            // Do not report a violation, because the font size may be inherited.
                            return null;
                        }
                    }
                    // Return a violation description.
                    return `Element is visible but its font size is ${fontSize}px, smaller than 11px`;
                }
            }
        }
    };
    const whats = 'Visible elements have font sizes smaller than 11 pixels';
    return await (0, testaro_1.doTest)(page, report, withItems, 'miniText', 'body, body *:not(script, style)', whats, 2, getBadWhat.toString());
};
exports.reporter = reporter;
