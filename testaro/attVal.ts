/*
  © 2023 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Page} from 'playwright';
import {doTest} from '../procs/testaro';
import type {GetBadWhat, Report} from '../types';

/*
  attVal
  This test reports elements with illicit values of an attribute.
  Compiled to attVal.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

// Runs the test and returns the result.
export const reporter = async (
  page: Page,
  report: Report,
  _0: unknown,
  withItems: boolean,
  attributeName: string,
  areLicit: boolean,
  values: string[]
) => {
  const getBadWhat: GetBadWhat = element => {
    // Get the value of the attribute.
    const value = element.getAttribute(attributeName);
    // If it violates the rule:
    if (areLicit !== values.includes(value as string)) {
      // Return a violation description.
      return `Element has attribute ${attributeName} with illicit value ${value}`;
    }
  };
  // The predicate runs inside the page, so bind its parameters as literals in the serialized source.
  const getBadWhatString = `((attributeName, areLicit, values) => ${
    getBadWhat.toString()
  })(${JSON.stringify(attributeName)}, ${Boolean(areLicit)}, ${JSON.stringify(values)})`;
  const whats = `Elements have attribute ${attributeName} with illicit values`;
  return await doTest(
    page, report, withItems, 'attVal', `[${attributeName}]`, whats, 2, getBadWhatString
  );
};
