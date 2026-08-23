/*
  © 2023–2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Page} from 'playwright';
import {doTest} from '../procs/testaro';
import type {GetBadWhat, Report} from '../types';

/*
  titledEl
  This test reports suspicious use of title attributes.
  Compiled to titledEl.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

// Runs the test and returns the result.
export const reporter = async (page: Page, report: Report, _: unknown, withItems: boolean) => {
  const getBadWhat: GetBadWhat = element => {
    const elementType = element.tagName.toLowerCase();
    // Return a violation description.
    return `Likely ineffective title attribute is used on the ${elementType} element`;
  }
  const selector = 'body [title]:not(iframe, link, style)';
  const whats = 'title attributes are used on elements they are likely ineffective on';
  return await doTest(
    page, report, withItems, 'titledEl', selector, whats, 0, getBadWhat.toString()
  );
};
