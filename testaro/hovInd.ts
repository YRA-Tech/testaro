/*
  © 2023–2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Locator, Page} from 'playwright';
import * as playwright from 'playwright';
import {getBasicResult} from '../procs/testaro';
import {applyMultiplier} from '../procs/config';
import type {Report, SeverityTotals} from '../types';

/*
  hovInd
  This test reports confusing hover indication. The triggers are visible links, buttons, inputs, and elements with hover listeners. Each trigger is inspected in three states: neutral, focused, and hovered over. Hovering is performed by Playwright, because CSS :hover styles cannot be activated by synthetic mouse events dispatched inside the page. A trigger violates the rule if its hover cursor is nonstandard for its type (severity 2), if it is a button whose border, outline, color, and background color do not change when it is hovered over (severity 1), or if those styles change on hover but are indistinguishable from its focus styles (severity 1). A trigger may produce more than one instance.
  Compiled to hovInd.js by tsc (issue #73); edit this file, not the emitted one.
*/

// TYPES

// The hover-related style properties of a trigger in one state.
interface TriggerStyles {
  tagName: string;
  inputType: string | null;
  cursor: string;
  border: string;
  outline: string;
  color: string;
  backgroundColor: string;
}
// A violation to be reported.
interface Violation {
  loc: Locator;
  what: string;
}

// CONSTANTS

// Standard non-default hover cursors of inputs, by type.
const standardInputCursors: Record<string, string> = {
  email: 'text',
  image: 'pointer',
  number: 'text',
  password: 'text',
  search: 'text',
  tel: 'text',
  text: 'text',
  url: 'text'
};
// Style properties compared between states.
const comparedStyles: (keyof TriggerStyles)[] = ['backgroundColor', 'border', 'color', 'outline'];
// Maximum count of triggers inspected, because each inspection performs 3 browser interactions.
const MAX_TRIGGERS = 60;

// FUNCTIONS

// Returns the hover-related style properties of a trigger in its current state.
const getStyles = async (loc: Locator): Promise<TriggerStyles> => await loc.evaluate(element => {
  const {
    cursor,
    borderColor,
    borderStyle,
    borderWidth,
    outlineColor,
    outlineStyle,
    outlineWidth,
    outlineOffset,
    color,
    backgroundColor
  } = window.getComputedStyle(element);
  return {
    tagName: element.tagName,
    inputType: element.tagName === 'INPUT' ? element.getAttribute('type') || 'text' : null,
    // Ignore any custom cursor images and keep only the fallback keyword.
    cursor: cursor.replace(/^.+, */, ''),
    border: `${borderColor} ${borderStyle} ${borderWidth}`,
    outline: `${outlineColor} ${outlineStyle} ${outlineWidth} ${outlineOffset}`,
    color,
    backgroundColor
  };
});
// Returns whether the hover cursor of a trigger is standard. A computed value of auto is standard, because browsers render it as the type-appropriate cursor.
const cursorIsStandard = (styles: TriggerStyles) => {
  const {tagName, inputType, cursor} = styles;
  if (tagName === 'A') {
    return ['pointer', 'auto'].includes(cursor);
  }
  if (tagName === 'INPUT') {
    return [standardInputCursors[inputType || 'text'], 'default', 'auto'].includes(cursor);
  }
  if (tagName === 'BUTTON') {
    return ['default', 'auto'].includes(cursor);
  }
  // Any other trigger is one with a hover listener, and its cursor is assumed standard.
  return true;
};
// Returns whether the compared styles of two states are identical.
const areAlike = (styles0: TriggerStyles, styles1: TriggerStyles) => comparedStyles
.every(style => styles0[style] === styles1[style]);
// Runs the test and returns the result.
export const reporter = async (page: Page, report: Report, _: unknown, withItems: boolean) => {
  // Get locators for the visible triggers.
  const selector = ['a', 'button', 'input', '[onmouseenter]', '[onmouseover]']
  .map(tagSelector => `body ${tagSelector}:visible`)
  .join(', ');
  const allLocs = await page.locator(selector).all();
  // Inspect at most MAX_TRIGGERS of them, evenly spaced through the page.
  const step = Math.max(1, Math.ceil(allLocs.length / MAX_TRIGGERS));
  const locs = allLocs.filter((loc, index) => index % step === 0).slice(0, MAX_TRIGGERS);
  const data: {
    triggerCount: number; inspectedCount: number; prevented?: boolean; error?: string;
  } = {
    triggerCount: allLocs.length,
    inspectedCount: locs.length
  };
  // Initialize the violations, by severity.
  const cursorViolations: Violation[] = [];
  const styleViolations: Violation[] = [];
  const timeout = applyMultiplier(500);
  // For each trigger:
  for (const loc of locs) {
    try {
      // Move the mouse away from any previously hovered trigger.
      await page.mouse.move(0, 0);
      // Get its styles when neither focused nor hovered over.
      const neutralStyles = await getStyles(loc);
      // Get its styles when only focused.
      await loc.focus({timeout});
      const focusStyles = await getStyles(loc);
      await loc.blur({timeout});
      // Get its styles when only hovered over.
      await loc.hover({timeout});
      const hoverStyles = await getStyles(loc);
      await page.mouse.move(0, 0);
      // If its hover cursor is nonstandard:
      if (! cursorIsStandard(hoverStyles)) {
        // Add a violation.
        cursorViolations.push({
          loc,
          what: `Element has a nonstandard hover cursor (${hoverStyles.cursor})`
        });
      }
      // If it is a button and its hover styles are indistinguishable from its neutral styles:
      if (hoverStyles.tagName === 'BUTTON' && areAlike(neutralStyles, hoverStyles)) {
        // Add a violation.
        styleViolations.push({
          loc,
          what: 'Element border, outline, color, and background color do not change when hovered over'
        });
      }
      // Otherwise, if its hover styles differ from its neutral styles but are indistinguishable from its focus styles:
      else if (! areAlike(neutralStyles, hoverStyles) && areAlike(focusStyles, hoverStyles)) {
        // Add a violation.
        styleViolations.push({
          loc,
          what: 'Element border, outline, color, and background color are alike on hover and focus'
        });
      }
    }
    // If focusing, blurring, or hovering throws an error:
    catch(error) {
      // If the error is a timeout, skip the trigger.
      if (error instanceof playwright.errors.TimeoutError) {
        continue;
      }
      // Otherwise, report this and quit.
      data.prevented = true;
      data.error = `ERROR inspecting a trigger (${(error as Error).message.slice(0, 200)})`;
      break;
    }
  }
  // Get results for the two severities and merge them.
  const cursorResult = await getBasicResult(
    report, withItems, 'hovInd', 2, 'Elements have nonstandard hover cursors', data, cursorViolations
  );
  const styleResult = await getBasicResult(
    report,
    withItems,
    'hovInd',
    1,
    'Element styles do not distinguish hovering from the neutral or focus state',
    data,
    styleViolations
  );
  const totals = cursorResult.totals.map(
    (total, index) => total + styleResult.totals[index]
  ) as SeverityTotals;
  return {
    data,
    totals,
    standardInstances: [... cursorResult.standardInstances, ... styleResult.standardInstances]
  };
};
