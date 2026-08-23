/*
  © 2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2025 Juan S. Casado.
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
  optRoleSel
  Clean-room rule.
  This test reports elements with role=option that are missing aria-selected attributes.
  Compiled to optRoleSel.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

// Runs the test and returns the result.
export const reporter = async (page: Page, report: Report, _: unknown, withItems: boolean) => {
  const getBadWhat: GetBadWhat = element => {
    // If the element has no aria-selected attribute:
    if (! element.hasAttribute('aria-selected')) {
      // Return a violation description.
      return 'Element has role=option but no aria-selected attribute';
    }
  };
  const whats = 'Elements with role=option have no aria-selected attributes';
  return await doTest(
    page, report, withItems, 'optRoleSel', 'body [role="option"]', whats, 1, getBadWhat.toString()
  );
};
