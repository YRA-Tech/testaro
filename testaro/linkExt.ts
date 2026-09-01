/*
  © 2023 CVS Health and/or one of its affiliates. All rights reserved.
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
  linkExt
  This test reports links with target=_blank attributes.
  Compiled to linkExt.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

// Runs the test and returns the result.
export const reporter = async (page: Page, report: Report, _: unknown, withItems: boolean) => {
  const getBadWhat: GetBadWhat = element => {
    // Return a violation description.
    return `Link has a target=_blank attribute`;
  };
  const whats = 'Links have target=_blank attributes';
  return await doTest(
    page, report, withItems, 'linkExt', 'body a[target=_blank]', whats, 0, getBadWhat.toString()
  );
};
