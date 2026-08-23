/*
  © 2023 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Page} from 'playwright';
import {doTest} from '../procs/testaro';
import type {GetBadWhat, Report} from '../types';

/*
  allCapStyle
  Related to Tenon rule 153.
  This test reports elements with transformed upper-case text. Blocks of upper-case text are difficult to read.
  Compiled to allCapStyle.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

// Runs the test and returns the result.
export const reporter = async (page: Page, report: Report, _: unknown, withItems: boolean) => {
  const getBadWhat: GetBadWhat = element => {
    // Get the style declaration of the element.
    const styleDec = window.getComputedStyle(element);
    const {textTransform} = styleDec;
    // If the style declaration transforms the element text to upper case:
    if (textTransform === 'uppercase') {
      const parent = element.parentElement;
      // If the element has a parent:
      if (parent) {
        // Get the style declaration of the parent.
        const parentStyleDec = window.getComputedStyle(parent);
        const {textTransform: parentTextTransform} = parentStyleDec;
        // If the style declaration transforms the parent text to upper case:
        if (parentTextTransform === 'uppercase') {
          // Do not report a violation, because the transformation may be inherited.
          return null;
        }
      }
      // If it has no parent or its transformation is autonomous, return a violation description.
      return 'Element text is transformed into all-capitals';
    }
  };
  const selector = 'body, body *:not(style, script, svg)';
  const whats = 'Elements have an all-capital text transformation style';
  return await doTest(
    page, report, withItems, 'allCapStyle', selector, whats, 0, getBadWhat.toString()
  );
};
