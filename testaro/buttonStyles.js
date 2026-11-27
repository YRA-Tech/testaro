"use strict";
/*
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.reporter = void 0;
const testaro_1 = require("../procs/testaro");
/*
  buttonStyles
  This test reports style differences among buttons. It assumes that an accessible page gives all its buttons the same values on particular style properties, listed in the 'styleProps' array. A violation is a button’s value on one of those properties that is not the plurality value of that property among the buttons of the page, i.e. not more common than every other value. If 2 or more values tie for most common, every button is a violator on that property. Buttons that are not rendered, are disabled, or have explicit roles other than button are not tested, since their styles may legitimately differ. The values compared are those of the page as loaded, not those in focus or hover states. This test uses the getBasicResult function because a button’s verdict depends on the styles of all the buttons.
  Compiled to buttonStyles.js by tsc (issue #73); edit this file, not the emitted one.
*/
// CONSTANTS
// Selector of buttons.
const buttonSelector = [
    'button',
    'input[type=button]',
    'input[type=submit]',
    'input[type=reset]',
    'input[type=image]',
    '[role=button]'
].join(', ');
// Style properties to be compared.
const styleProps = [
    'font-style',
    'font-weight',
    'font-size',
    'line-height',
    'color',
    'background-color',
    'opacity',
    'text-decoration-line',
    'text-decoration-style',
    'text-decoration-thickness',
    'border-style',
    'border-width',
    'border-radius',
    'padding',
    'min-width',
    'max-width',
    'min-height',
    'max-height',
    'outline-offset',
    'outline-style',
    'outline-width'
];
// FUNCTIONS
// Returns a quoted value.
const quote = (value) => `“${value}”`;
// Runs the test and returns the result.
const reporter = async (page, report, _, withItems) => {
    const loc = page.locator(buttonSelector);
    // Get the style-property values of each testable button, or null for any other element.
    const buttonValues = await loc.evaluateAll((elements, styleProps) => elements.map(element => {
        const role = (element.getAttribute('role') || '').trim();
        const isButtonRole = !role || role.split(/\s+/)[0] === 'button';
        const isDisabled = element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true';
        if (isButtonRole && !isDisabled && element.checkVisibility()) {
            const styleDec = window.getComputedStyle(element);
            return styleProps.map(styleProp => styleDec.getPropertyValue(styleProp));
        }
        return null;
    }), styleProps);
    const buttonIndexes = buttonValues
        .map((values, index) => values ? index : -1)
        .filter(index => index > -1);
    // Initialize the distributions of values of the style properties on which buttons differ.
    const distributions = {};
    const violations = [];
    // For each style property:
    styleProps.forEach((styleProp, propIndex) => {
        // Get the distribution of its values among the buttons.
        const counts = Object.create(null);
        buttonIndexes.forEach(index => {
            const value = buttonValues[index][propIndex];
            counts[value] = (counts[value] || 0) + 1;
        });
        // If the buttons differ on it:
        if (Object.keys(counts).length > 1) {
            // Add its distribution to the data.
            distributions[styleProp] = { ...counts };
        }
    });
    // For each testable button:
    buttonIndexes.forEach(index => {
        // For each style property on which buttons differ:
        styleProps.forEach((styleProp, propIndex) => {
            const counts = distributions[styleProp];
            if (counts) {
                const value = buttonValues[index][propIndex];
                // Get the most common values.
                const maxCount = Math.max(...Object.values(counts));
                const topValues = Object.keys(counts).filter(topValue => counts[topValue] === maxCount);
                // If the button’s value is not the plurality value:
                if (topValues.length > 1 || topValues[0] !== value) {
                    // Add a violation, describing the plurality value or the tied values.
                    const isTied = topValues.includes(value);
                    const otherValues = topValues
                        .filter(topValue => topValue !== value)
                        .map(quote)
                        .join(' or ');
                    const tiedOther = buttonIndexes.length > 2 ? 'other buttons have' : 'another button has';
                    violations.push({
                        loc: loc.nth(index),
                        what: `Element ${styleProp} value is ${quote(value)}, but ${isTied ? tiedOther : 'more buttons have'} ${otherValues}`
                    });
                }
            }
        });
    });
    // Get and return a result.
    const data = {
        buttonCount: buttonIndexes.length,
        distributions
    };
    const whats = 'Buttons have style-property values that are not the most common among buttons';
    return await (0, testaro_1.getBasicResult)(report, withItems, 'buttonStyles', 0, whats, data, violations);
};
exports.reporter = reporter;
