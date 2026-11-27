/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Page} from 'playwright';

/*
  xPathScript
  The in-page script that defines window.getXPath, shared by the launcher (which adds it as an
  init script to every page it creates) and the checkpoint cataloguer (which defines it on a live
  page that was launched without it). Compiled to xPathScript.js by tsc (issue #73); edit this
  file, not the emitted one.
*/

// FUNCTIONS

/*
  Defines window.getXPath in the page. Runs inside the page, so it must be closure-free. Its
  source text, as tsc emits it, is what the page runs: type it only with what tsc erases
  (contextual types and casts), never with anything that leaves code behind.
*/
const installGetXPath = () => {
  window.getXPath = element => {
    if (! element || element.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }
    const segments = [];
    // As long as the current node is an element:
    while (element && element.nodeType === Node.ELEMENT_NODE) {
      const tag = element.tagName.toLowerCase();
      // If it is the html element:
      if (element === document.documentElement) {
        // Prepend it to the segment array
        segments.unshift('html');
        // Stop traversing.
        break;
      }
      // Otherwise, get its parent node.
      const parent = element.parentNode;
      // If (abnormally) the parent node is not an element:
      if (! parent || parent.nodeType !== Node.ELEMENT_NODE) {
        // Prepend the element (not the parent) to the segment array.
        segments.unshift(tag);
        // Stop traversing, leaving the segment array partial.
        break;
      }
      // Get the subscript of the element if it is not the body element.
      const cohort = Array
      .from(parent.childNodes)
      .filter(
        childNode => childNode.nodeType === Node.ELEMENT_NODE
        && (childNode as Element).tagName === element.tagName
      );
      const subscript = tag === 'body' ? '' : `[${cohort.indexOf(element) + 1}]`;
      // Prepend the element identifier to the segment array.
      segments.unshift(`${tag}${subscript}`);
      // Continue the traversal with the parent of the current element.
      element = parent as Element;
    }
    // Return the XPath.
    return `/${segments.join('/')}`;
  };
};
// The script as source text, for addInitScript and evaluate.
export const getXPathSource: string = `(${installGetXPath.toString()})();`;
// Defines window.getXPath on a live page if it is not already defined.
export const defineGetXPath = async (page: Page): Promise<void> => {
  const isDefined = await page.evaluate(() => typeof window.getXPath === 'function');
  if (! isDefined) {
    await page.evaluate(getXPathSource);
  }
};
