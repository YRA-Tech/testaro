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
  captionLoc
  This test reports caption elements that are not the first children of table elements.
  Compiled to captionLoc.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

export const reporter = async (page: Page, report: Report, _: unknown, withItems: boolean) => {
  const getBadWhat: GetBadWhat = element => {
    const parent = element.parentElement;
    // If the element is not the first child of a table element:
    if (! parent || parent.tagName !== 'TABLE' || parent.firstElementChild !== element) {
      // Return a violation description.
      return 'caption element is not the first child of a table element';
    }
  };
  const whats = 'caption elements are not the first children of table elements';
  return await doTest(
    page, report, withItems, 'captionLoc', 'body caption', whats, 3, getBadWhat.toString()
  );
};
