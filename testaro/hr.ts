/*
  © 2023–2024 CVS Health and/or one of its affiliates. All rights reserved.
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
  hr
  This test reports the use of hr elements. Compiled to hr.js by tsc (issue #73); edit this
  file, not the emitted one.
*/

// FUNCTIONS

// Runs the test and returns the result.
export const reporter = async (page: Page, report: Report, _: unknown, withItems: boolean) => {
  const getBadWhat: GetBadWhat = element => {
    // Return a violation description.
    return `hr element is used for vertical segmentation`;
  }
  const whats = 'HR elements are used for vertical segmentation';
  return await doTest(
    page, report, withItems, 'hr', 'body hr', whats, 0, getBadWhat.toString()
  );
};
