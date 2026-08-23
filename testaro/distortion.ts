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
  distortion
  Related to Tenon rule 271.
  This test reports elements whose transform style properties distort the content. Distortion makes text difficult to read.
  Compiled to distortion.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

// Runs the test and returns the result.
export const reporter = async (page: Page, report: Report, _: unknown, withItems: boolean) => {
  const getBadWhat: GetBadWhat = element => {
    const styleDec = window.getComputedStyle(element);
    const {transform} = styleDec;
    const badTransformTypes = ['matrix', 'perspective', 'rotate', 'scale', 'skew'];
    // If the element style transforms the text:
    if (transform) {
      const transformType = badTransformTypes.find(key => transform.includes(key));
      // If the transformation is distortive:
      if (transformType) {
        // Return a violation description.
        return `Element distorts its text with ${transformType} transformation`;
      }
    }
  };
  const whats = 'Elements distort their texts';
  return await doTest(
    page, report, withItems, 'distortion', 'body, body *', whats, 0, getBadWhat.toString()
  );
};
