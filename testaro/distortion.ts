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
    const {transform} = window.getComputedStyle(element);
    // If the element has a transform (a computed value is always a matrix or matrix3d function):
    if (transform && transform !== 'none') {
      // Get the numeric arguments of the matrix function (its name is excluded, since it may contain a digit).
      const argumentString = transform.slice(transform.indexOf('(') + 1);
      const values = (argumentString.match(/-?\d*\.?\d+(?:e[+-]?\d+)?/g) || []).map(Number);
      const isNear = (value0: number, value1: number) => Math.abs(value0 - value1) < 1e-6;
      // Returns the type of a 2-dimensional transformation, or null if it only translates.
      const get2DType = (a: number, b: number, c: number, d: number) => {
        if (isNear(a, 1) && isNear(b, 0) && isNear(c, 0) && isNear(d, 1)) {
          return null;
        }
        if (isNear(b, 0) && isNear(c, 0)) {
          return 'scale';
        }
        if (isNear(a, d) && isNear(b, -c)) {
          return 'rotation';
        }
        return 'skew';
      };
      let type: string | null = 'nonstandard';
      // If the transform is 2-dimensional:
      if (values.length === 6) {
        type = get2DType(values[0], values[1], values[2], values[3]);
      }
      // Otherwise, if it is 3-dimensional:
      else if (values.length === 16) {
        const [m11, m12, m13, m14, m21, m22, m23, m24, m31, m32, m33, m34, , , m43, m44] = values;
        const is2D = [m13, m14, m23, m24, m31, m32, m34, m43].every(value => isNear(value, 0))
        && isNear(m33, 1)
        && isNear(m44, 1);
        // If it is equivalent to a 2-dimensional transform, classify it as one.
        if (is2D) {
          type = get2DType(m11, m12, m21, m22);
        }
        // Otherwise, classify it as a perspective or other 3-dimensional transformation.
        else {
          type = isNear(m34, 0) ? '3-dimensional' : 'perspective';
        }
      }
      // If the transformation is distortive, i.e. not a pure translation:
      if (type) {
        // Return a violation description.
        return `Element distorts its text with a ${type} transformation`;
      }
    }
  };
  const whats = 'Elements distort their texts';
  return await doTest(
    page, report, withItems, 'distortion', 'body, body *', whats, 0, getBadWhat.toString()
  );
};
