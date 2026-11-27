/*
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  styleConsistency
  Shared procedure of the Testaro rules that report elements whose style-property values are not the plurality values among the elements of their groups (buttonStyles, headingStyles, linkStyles). A value is the plurality value of a property in a group if more elements of the group have it than have any other value. If 2 or more values tie for most common, every element of the group is a violator on that property.
*/

// IMPORTS

import type {Locator} from 'playwright';
import {getBasicResult} from './testaro';
import type {Report} from '../types';

// TYPES

// An element to be tested: its index among the matches of the rule’s locator, the ID of its group, and its values on the style properties.
export interface StyledElement {
  index: number;
  group: string;
  values: string[];
}

// FUNCTIONS

// Returns a quoted value.
const quote = (value: string) => `“${value}”`;
// Tests the elements for style consistency within their groups and returns a result.
export const getStyleResult = async (
  report: Report,
  withItems: boolean,
  ruleID: string,
  whats: string,
  loc: Locator,
  styleProps: string[],
  elements: StyledElement[],
  // Returns the singular and plural nouns of a group, such as ['button', 'buttons'].
  getNouns: (group: string) => [string, string]
) => {
  // Initialize the element counts of the groups and the distributions of the values of the style properties on which the elements of each group differ.
  const counts: Record<string, number> = {};
  const distributions: Record<string, Record<string, Record<string, number>>> = {};
  elements.forEach(element => {
    counts[element.group] = (counts[element.group] || 0) + 1;
  });
  // For each group:
  Object.keys(counts).forEach(group => {
    const groupElements = elements.filter(element => element.group === group);
    // For each style property:
    styleProps.forEach((styleProp, propIndex) => {
      // Get the distribution of its values among the elements of the group.
      const valueCounts: Record<string, number> = Object.create(null);
      groupElements.forEach(element => {
        const value = element.values[propIndex];
        valueCounts[value] = (valueCounts[value] || 0) + 1;
      });
      // If the elements differ on it:
      if (Object.keys(valueCounts).length > 1) {
        // Add its distribution to the data.
        distributions[group] ??= {};
        distributions[group][styleProp] = {...valueCounts};
      }
    });
  });
  const violations: {loc: Locator; what: string}[] = [];
  // For each element:
  elements.forEach(element => {
    const {group, index, values} = element;
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
  return await getBasicResult(report, withItems, ruleID, 0, whats, {counts, distributions}, violations);
};
