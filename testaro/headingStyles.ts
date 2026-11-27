/*
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Page} from 'playwright';
import {getStyleResult} from '../procs/styleConsistency';
import type {StyledElement} from '../procs/styleConsistency';
import type {Report} from '../types';

/*
  headingStyles
  This test reports style differences among headings of the same level. It assumes that an accessible page gives all its headings of each level the same values on particular style properties, listed in the 'styleProps' array. A violation is a heading’s value on one of those properties that is not the plurality value of that property among the headings of its level on the page, i.e. not more common than every other value. If 2 or more values tie for most common, every heading of the level is a violator on that property. Values are compared whatever their sources, including inheritance from ancestors. The headings are the h1 to h6 elements and the elements with heading roles. The level of a heading is its valid aria-level value if any, otherwise the level of its tag name for h1 to h6, otherwise 2. Headings that are not rendered or have explicit roles other than heading are not tested. This test uses the getBasicResult function (through getStyleResult) because a heading’s verdict depends on the styles of all the headings of its level.
  Compiled to headingStyles.js by tsc (issue #73); edit this file, not the emitted one.
*/

// CONSTANTS

// Selector of headings.
const headingSelector = 'h1, h2, h3, h4, h5, h6, [role~=heading]';
// Style properties to be compared.
const styleProps = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-transform',
  'color',
  'opacity',
  'text-decoration-line',
  'text-decoration-style',
  'text-decoration-thickness'
];

// FUNCTIONS

// Runs the test and returns the result.
export const reporter = async (page: Page, report: Report, _: unknown, withItems: boolean) => {
  const loc = page.locator(headingSelector);
  // Get the level and style-property values of each testable heading, or null for any other element.
  const headingData = await loc.evaluateAll((elements, styleProps) => elements.map(element => {
    const role = (element.getAttribute('role') || '').trim();
    const isHeadingRole = ! role || role.split(/\s+/)[0] === 'heading';
    const isVisible = element.checkVisibility({
      contentVisibilityAuto: true,
      opacityProperty: true,
      visibilityProperty: true
    });
    if (isHeadingRole && isVisible) {
      const ariaLevel = (element.getAttribute('aria-level') || '').trim();
      const tagLevel = /^H[1-6]$/.test(element.tagName) ? Number(element.tagName[1]) : 2;
      const level = /^[1-9]\d*$/.test(ariaLevel) ? Number(ariaLevel) : tagLevel;
      const styleDec = window.getComputedStyle(element);
      return {
        level,
        values: styleProps.map(styleProp => styleDec.getPropertyValue(styleProp))
      };
    }
    return null;
  }), styleProps);
  // Group the testable headings by level.
  const headings: StyledElement[] = [];
  headingData.forEach((datum, index) => {
    if (datum) {
      headings.push({index, group: String(datum.level), values: datum.values});
    }
  });
  // Get and return a result.
  const whats = 'Headings have style-property values that are not the most common among headings of their levels';
  return await getStyleResult(
    report,
    withItems,
    'headingStyles',
    whats,
    loc,
    styleProps,
    headings,
    group => [`level-${group} heading`, `level-${group} headings`]
  );
};
