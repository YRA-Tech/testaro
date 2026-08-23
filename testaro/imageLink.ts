/*
  © 2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2025 Juan S. Casado.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Page} from 'playwright';
import {doTest} from '../procs/testaro';
import type {GetBadWhat, Report} from '../types';

/*
  imageLink
  Clean-room rule.
  This test reports links whose destinations are image files.
  Compiled to imageLink.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

// Runs the test and returns the result.
export const reporter = async (page: Page, report: Report, _: unknown, withItems: boolean) => {
  const getBadWhat: GetBadWhat = element => {
    const href = element.getAttribute('href') || '';
    // If the destination of the element is an image file:
    if (/\.(?:png|jpe?g|gif|svg|webp|ico)(?:$|[?#])/i.test(href)) {
      // Return a violation description.
      return 'Link destination is an image file';
    }
  };
  const whats = 'Links have image files as their destinations';
  return await doTest(
    page, report, withItems, 'imageLink', 'body  a[href]', whats, 0, getBadWhat.toString()
  );
};
