/*
  © 2022–2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Page} from 'playwright';
import {doTest} from '../procs/testaro';
import type {BadWhat, Report} from '../types';

/*
  focVis
  Derived from the bbc-a11y elementsMustBeVisibleOnFocus test.
  This test reports links that are at least partly off the display when focused.
  Compiled to focVis.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

// Runs the test and returns the result.
export const reporter = async (page: Page, report: Report, _: unknown, withItems: boolean) => {
  // The candidate selector guarantees focusable HTML elements.
  const getBadWhat = (element: HTMLElement): BadWhat => {
    const isVisible = element.checkVisibility({
      contentVisibilityAuto: true,
      opacityProperty: true,
      visibilityProperty: true
    });
    // If the element is visible:
    if (isVisible) {
      // Focus it.
      element.focus();
      const box = element.getBoundingClientRect();
      // If it violates the rule:
      if (box.x < 0 || box.y < 0) {
        // Return a violation description.
        return 'Upper left corner of the element is above or to the left of the display';
      }
    }
  };
  const whats = 'Visible links are above or to the left of the display';
  return await doTest(
    page, report, withItems, 'focVis', 'body a', whats, 2, getBadWhat.toString()
  );
};
