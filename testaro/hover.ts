/*
  © 2021–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Locator, Page} from 'playwright';
import {getBasicResult} from '../procs/testaro';
import type {Report} from '../types';
import * as playwright from 'playwright';
// Shared configuration for timeout multiplier.
import {applyMultiplier} from '../procs/config';

// TYPES

// The injected getXPath is reached as a bare page global inside locator evaluate callbacks.
declare const getXPath: Window['getXPath'];

/*
  hover
  This test reports unexpected impacts of hovering. The elements that are subjected to hovering (called “triggers”) include all the elements that have attributes associated with control over the visibility of other elements. If hovering over an element results in an increase or decrease in the total count of visible elements in the tree rooted in the grandparent of the trigger, the rule is considered violated. This test uses the getBasicResult function in order to use Playwright for the most realistic hover simulation.
  Compiled to hover.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

// Returns an awaited change in a visible element count.
const getVisibleCountChange = async (
  rootLoc: Locator, elementCount0: number, timeLimit = 400, settleInterval = 75
) => {
  const startTime = Date.now();
  let timeout: NodeJS.Timeout;
  let settleChecker: NodeJS.Timeout;
  let elementCount1 = elementCount0;
  // Set a time limit on the change.
  const timeoutPromise = new Promise<void>(resolve => {
    timeout = setTimeout(() => {
      clearInterval(settleChecker);
      resolve();
    }, timeLimit);
  });
  // Until the time limit expires, periodically:
  const settlePromise = new Promise<void>(resolve => {
    settleChecker = setInterval(async () => {
      const visiblesLoc = await rootLoc.locator('*:visible');
      // Get the count.
      elementCount1 = await visiblesLoc.count();
      // If the count has changed:
      if (elementCount1 !== elementCount0) {
        // Stop.
        clearTimeout(timeout);
        clearInterval(settleChecker);
        resolve();
      }
    }, settleInterval);
  });
  // When a change occurs or the time limit expires:
  await Promise.race([timeoutPromise, settlePromise]);
  const elapsedTime = Math.round(Date.now() - startTime);
  // Return the change.
  return {
    change: elementCount1 - elementCount0,
    elapsedTime
  };
};
// Gets a violation description.
const getViolationDescription = (change: number, elapsedTime: number) =>
  `Hovering over the element changes the related visible element count by ${change} in ${elapsedTime}ms`;
// Runs the test and returns the result.
export const reporter = async (page: Page, report: Report, _: unknown, withItems: boolean) => {
  // Initialize the locators and result.
  const candidateLocs = await page.locator([
   '[aria-controls]:visible',
   '[aria-expanded]:visible',
   '[aria-haspopup]:visible',
   '[onmouseenter]:visible',
   '[onmouseover]:visible',
   '[onpointerenter]:visible',
   '[onpointerover]:visible',
   '[role="menu"]:visible',
   '[role="menubar"]:visible',
   '[role="menuitem"]:visible',
   '[data-tooltip]:visible',
   '[data-popover]:visible',
   '[data-hover]:visible',
   '[data-menu]:visible',
   '[data-dropdown]:visible',
   '[role=tab]:visible',
   '[role=combobox]:visible'
  ].join(', '));
  const allLocs = await candidateLocs.all();
  const violations: {loc: Locator; what: string}[] = [];
  const data: {hoverableCount: number; prevented?: boolean; error?: string} = {
    hoverableCount: allLocs.length
  };
  // For each locator:
  for (const loc of allLocs) {
    // Get the XPath of the element referenced by the locator.
    let xPath = (await loc.evaluate(element => getXPath(element)))!;
    const pathSegments = xPath.split('/');
    const {length} = pathSegments;
    // Change it to the XPath of the desired observation root.
    pathSegments.pop();
    if (! ['main', 'body'].includes(pathSegments[length - 2])) {
      pathSegments.pop();
    }
    xPath = pathSegments.join('/');
    // Get a locator for the observation root.
    const rootLoc = page.locator(`xpath=${xPath}`);
    const loc0 = await rootLoc.locator('*:visible');
    // Get a pre-hover count of the visible elements in the observation tree.
    const elementCount0 = await loc0.count();
    try {
      // Hover over the element.
      await loc.hover({timeout: applyMultiplier(400)});
      // Get the change in the count of the visible elements in the observation tree.
      const changeData = await getVisibleCountChange(rootLoc, elementCount0, 400, 75);
      const {change, elapsedTime} = changeData;
      // If a change occurred:
      if (change) {
        // Add the locator and a violation description to the array of violations.
        violations.push({
          loc,
          what: getViolationDescription(change, elapsedTime)
        });
      }
      // Stop hovering over the element.
      await page.mouse.move(0, 0);
      // Await a reverse change in the count of the visible elements in the observation tree.
      await getVisibleCountChange(rootLoc, elementCount0 + change);
    }
    // If hovering throws an error:
    catch(error) {
      // If the error is a timeout:
      if (error instanceof playwright.errors.TimeoutError) {
        // Skip the locator.
        continue;
      }
      // Otherwise, i.e. if the error is not a timeout, report this and quit.
      data.prevented = true;
      data.error = `ERROR hovering over an element (${(error as Error).message.slice(0, 200)})`;
      break;
    }
  }
  // Get and return a result.
  const whats = 'Hovering over elements changes the number of related visible elements';
  return await getBasicResult(report, withItems, 'hover', 0, whats, data, violations);
};
