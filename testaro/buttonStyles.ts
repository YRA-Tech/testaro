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
  buttonStyles
  This test reports style differences among buttons. It assumes that an accessible page gives all its buttons the same values on particular style properties, listed in the 'styleProps' array. A violation is a button’s value on one of those properties that is not the plurality value of that property among the buttons of the page, i.e. not more common than every other value. If 2 or more values tie for most common, every button is a violator on that property. Buttons that are not rendered, are disabled, or have explicit roles other than button are not tested, since their styles may legitimately differ. The values compared are those of the page as loaded, not those in focus or hover states. This test uses the getBasicResult function (through getStyleResult) because a button’s verdict depends on the styles of all the buttons.
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

// Runs the test and returns the result.
export const reporter = async (page: Page, report: Report, _: unknown, withItems: boolean) => {
  const loc = page.locator(buttonSelector);
  // Get the style-property values of each testable button, or null for any other element.
  const buttonValues = await loc.evaluateAll((elements, styleProps) => elements.map(element => {
    const role = (element.getAttribute('role') || '').trim();
    const isButtonRole = ! role || role.split(/\s+/)[0] === 'button';
    const isDisabled = element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true';
    if (isButtonRole && ! isDisabled && element.checkVisibility()) {
      const styleDec = window.getComputedStyle(element);
      return styleProps.map(styleProp => styleDec.getPropertyValue(styleProp));
    }
    return null;
  }), styleProps);
  // Treat the testable buttons as one group.
  const buttons: StyledElement[] = [];
  buttonValues.forEach((values, index) => {
    if (values) {
      buttons.push({index, group: 'button', values});
    }
  });
  // Get and return a result.
  const whats = 'Buttons have style-property values that are not the most common among buttons';
  return await getStyleResult(
    report, withItems, 'buttonStyles', whats, loc, styleProps, buttons, () => ['button', 'buttons']
  );
};
