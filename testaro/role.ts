/*
  © 2021–2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Locator, Page} from 'playwright';
import {getBasicResult} from '../procs/testaro';
import type {Report} from '../types';
// aria-query ships no type declarations, so its import stays a require and is untyped.
const {elementRoles} = require('aria-query');

/*
  role
  This test reports elements with native-replacing explicit role attributes. This test uses the getBasicResult function in order to have access to the aria-query dependency.
  Compiled to role.js by tsc (issue #73); edit this file, not the emitted one.
*/

// CONSTANTS

// Implicit roles
const implicitRoles = new Set<string>(Array.from(elementRoles.values() as string[][]).flat());

// FUNCTIONS

// Runs the test and returns the result.
export const reporter = async (page: Page, report: Report, _: unknown, withItems: boolean) => {
  // Get locators for the elements with explicit roles.
  const loc = page.locator('[role]');
  const locs = await loc.all();
  const violations: {loc: Locator; what: string}[] = [];
  // Get data on those with roles that are also implicit.
  for (const loc of locs) {
    const roleSpec = await loc.getAttribute('role');
    const roles = roleSpec!.split(/\s+/);
    const badRole = roles.find(role => implicitRoles.has(role));
    if (badRole) {
      violations.push({
        loc,
        what: `Explicit ${badRole} role of the element is also an implicit HTML element role`
      });
    }
  }
  // Get and return a result.
  const whats = 'Elements have roles assigned that are also implicit HTML element roles';
  return await getBasicResult(report, withItems, 'role', 0, whats, {}, violations);
};
