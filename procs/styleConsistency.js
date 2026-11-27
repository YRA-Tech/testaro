"use strict";
/*
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStyleResult = void 0;
const testaro_1 = require("./testaro");
// FUNCTIONS
// Returns a quoted value.
const quote = (value) => `“${value}”`;
// Tests the elements for style consistency within their groups and returns a result.
const getStyleResult = async (report, withItems, ruleID, whats, loc, styleProps, elements, 
// Returns the singular and plural nouns of a group, such as ['button', 'buttons'].
getNouns) => {
    // Initialize the element counts of the groups and the distributions of the values of the style properties on which the elements of each group differ.
    const counts = {};
    const distributions = {};
    elements.forEach(element => {
        counts[element.group] = (counts[element.group] || 0) + 1;
    });
    // For each group:
    Object.keys(counts).forEach(group => {
        const groupElements = elements.filter(element => element.group === group);
        // For each style property:
        styleProps.forEach((styleProp, propIndex) => {
            // Get the distribution of its values among the elements of the group.
            const valueCounts = Object.create(null);
            groupElements.forEach(element => {
                const value = element.values[propIndex];
                valueCounts[value] = (valueCounts[value] || 0) + 1;
            });
            // If the elements differ on it:
            if (Object.keys(valueCounts).length > 1) {
                // Add its distribution to the data.
                distributions[group] ??= {};
                distributions[group][styleProp] = { ...valueCounts };
            }
        });
    });
    const violations = [];
    // For each element:
    elements.forEach(element => {
        const { group, index, values } = element;
        const [singular, plural] = getNouns(group);
        // For each style property on which the elements of its group differ:
        styleProps.forEach((styleProp, propIndex) => {
            const valueCounts = distributions[group]?.[styleProp];
            if (valueCounts) {
                const value = values[propIndex];
                // Get the most common values.
                const maxCount = Math.max(...Object.values(valueCounts));
                const topValues = Object.keys(valueCounts).filter(topValue => valueCounts[topValue] === maxCount);
                // If the element’s value is not the plurality value:
                if (topValues.length > 1 || topValues[0] !== value) {
                    // Add a violation, describing the plurality value or the tied values.
                    const isTied = topValues.includes(value);
                    const otherValues = topValues
                        .filter(topValue => topValue !== value)
                        .map(quote)
                        .join(' or ');
                    const tiedOther = counts[group] > 2 ? `other ${plural} have` : `another ${singular} has`;
                    violations.push({
                        loc: loc.nth(index),
                        what: `Element ${styleProp} value is ${quote(value)}, but ${isTied ? tiedOther : `more ${plural} have`} ${otherValues}`
                    });
                }
            }
        });
    });
    // Get and return a result.
    return await (0, testaro_1.getBasicResult)(report, withItems, ruleID, 0, whats, { counts, distributions }, violations);
};
exports.getStyleResult = getStyleResult;
