/*
  © 2023 CVS Health and/or one of its affiliates. All rights reserved.
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
  linkOldAtt
  This test reports links with deprecated attributes.
  Compiled to linkOldAtt.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

// Runs the test and returns the result.
export const reporter = async (page: Page, report: Report, _: unknown, withItems: boolean) => {
  const getBadWhat: GetBadWhat = element => {
    const attNames = element.getAttributeNames();
    const allBadAttNames = ['charset', 'coords', 'name', 'rev', 'shape'];
    const elementBadAttNames = allBadAttNames.filter(att => attNames.includes(att));
    // If the element has 1 deprecated attribute:
    if (elementBadAttNames.length === 1) {
      // Return a violation description.
      return `${elementBadAttNames[0]} attribute is deprecated`;
    }
    // Otherwise, if the element has 2 or more deprecated attributes:
    if (elementBadAttNames.length > 1) {
      // Return a violation description.
      return `Element has deprecated attributes: ${elementBadAttNames.join(', ')}`;
    }
  };
  const selector = 'body a[charset], body a[coords], body a[name], body a[rev], body a[shape]';
  const whats = 'Links have deprecated attributes';
  return await doTest(
    page, report, withItems, 'linkOldAtt', selector, whats, 1, getBadWhat.toString()
  );
};
