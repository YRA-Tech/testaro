/*
  © 2023 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Page} from 'playwright';
import {doTest} from '../procs/testaro';
import type {GetBadWhat, Report} from '../types';

/*
  pseudoP
  This test reports 2 or more sequential br elements without intervening text content. They may be inferior substitutes for p elements.
  Compiled to pseudoP.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

// Runs the test and returns the result.
export const reporter = async (page: Page, report: Report, _: unknown, withItems: boolean) => {
  const getBadWhat: GetBadWhat = element => {
    // Get the node before the element node.
    const previousNode = element.previousSibling;
    let isBad = false;
    // If it is a br element:
    if (previousNode && previousNode.nodeType === Node.ELEMENT_NODE && (previousNode as Element).tagName === 'BR') {
      // Classify the element as a violator.
      isBad = true;
    }
    // Otherwise, if it is a text node:
    else if (previousNode && previousNode.nodeType === Node.TEXT_NODE) {
      // If the text node contains only whitespace:
      if (previousNode.textContent!.trim() === '') {
        // Get the node before the text node.
        const beforeText = previousNode.previousSibling;
        // If that node is a br element:
        if (beforeText && beforeText.nodeType === Node.ELEMENT_NODE && (beforeText as Element).tagName === 'BR') {
          // Classify the element as a violator.
          isBad = true;
        }
      }
    }
    // If the element is a violator:
    if (isBad) {
      // Return a violation description.
      return `Element follows another br element, possibly constituting a pseudo-paragraph`;
    }
  };
  const whats = 'br elements follow other br elements, possibly constituting pseudo-paragraphs';
  return await doTest(
    page, report, withItems, 'pseudoP', 'body br', whats, 0, getBadWhat.toString()
  );
};
