/*
  © 2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or   https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Page} from 'playwright';
import {doTest} from '../procs/testaro';
import type {GetBadWhat, Report} from '../types';

/*
  textSem
  This test reports semantically vague inline elements: i, b, small.
  Compiled to textSem.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

// Runs the test and returns the result.
export const reporter = async (page: Page, report: Report, _: unknown, withItems: boolean) => {
  const getBadWhat: GetBadWhat = element => {
    const isVisible = element.checkVisibility({
      contentVisibilityAuto: true,
      opacityProperty: true,
      visibilityProperty: true
    });
    // If the element is visible:
    if (isVisible) {
      // If it has text content:
      if (element.textContent.trim().replace(/\s/g, '')) {
        // Return a violation description.
        return `Element type (${element.tagName}) is semantically vague`;
      }
    }
  };
  const selector = 'body i, body b, body small';
  const whats = 'Semantically vague elements i, b, and/or small are used';
  return await doTest(
    page, report, withItems, 'textSem', selector, whats, 0, getBadWhat.toString()
  );
};
