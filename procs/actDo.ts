/*
  © 2021–2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {ElementHandle, Page} from 'playwright';
import {addError} from './error';
// Function to take a full-page screenshot.
import {shoot} from './shoot';
import type {ShootOptions} from './shoot';
import type {Act, Checkpoint, Interaction, Report} from '../types';

/*
  actDo
  Performs the acts that operate on a live page: navigation, waiting, revealing, screenshots,
  moves (button, checkbox, focus, link, radio, search, select, text), and key presses. The acts
  loop (doActs.js) calls doInteractionAct for each such act, and the launcher (launch.js) calls
  replayActs to re-enact the acts that reached a checkpoint before a tool tests it.

  The `interaction` option selects the event modality; only 'efficient' (Playwright's composed
  clicks and key presses) exists today. Recorded on each checkpoint, it lets a replay use the
  same modality the original acts used.

  Compiled to actDo.js by tsc (issue #73); edit this file, not the emitted one. Acts are typed
  with the permissive Act until Phase 4.5 adds a type per act, so the act-specific properties
  read here are cast where they are used.
*/

// TYPES

// The arguments of doInteractionAct.
export interface InteractionActOptions {
  page: Page;
  report: Report;
  act: Act;
  actIndex: number;
  actCount?: number;
  interaction?: Interaction;
}
// The properties of a presses act (whose which is a list of texts, not a string).
interface PressesAct {
  navKey: string;
  what?: string;
  which?: string[];
  withItems?: boolean;
  text?: string;
  action?: string;
}
// What a presses act records about each element it reaches.
interface PressesItem {
  tagName: string;
  text: string;
  textLength: number;
  matchedText?: string;
}

// CONSTANTS

// CSS selectors for targets of moves.
export const moves: Record<string, string | true> = {
  button: 'button, [role=button], input[type=submit]',
  checkbox: 'input[type=checkbox]',
  focus: true,
  link: 'a, [role=link]',
  radio: 'input[type=radio]',
  search: 'input[type=search], input[aria-label*=search i], input[placeholder*=search i]',
  select: 'select',
  text: 'input'
};
// Act types that doInteractionAct performs (every act type that needs a live page).
export const interactionTypes: string[] = [
  'url', 'wait', 'state', 'page', 'reveal', 'shoot', 'press', 'presses', ... Object.keys(moves)
];
// The default interaction options.
export const defaultInteraction: Interaction = {modality: 'efficient'};

// FUNCTIONS

// The launcher requires this module, so require it lazily to avoid a circular load.
const getLaunch = () => require('./launch') as typeof import('./launch');
// Normalizes spacing characters and cases in a string.
export const debloat = (string: string): string => string
.replace(/\s/g, ' ')
.trim()
.replace(/ {2,}/g, ' ')
.toLowerCase();
// Returns the first line of an error message.
const errorStart = (error: unknown): string => (error as Error).message.replace(/\n.+/s, '');
// Returns the text of an element, lower-cased.
const textOf = async (
  page: Page, element: ElementHandle | null
): Promise<string | null> => {
  if (element) {
    const tagNameJSHandle = await element.getProperty('tagName');
    const tagName = await tagNameJSHandle.jsonValue();
    let totalText = '';
    // If the element is a link, button, input, or select list:
    if (['A', 'BUTTON', 'INPUT', 'SELECT'].includes(tagName)) {
      // Return its visible labels, descriptions, and legend if the first input in a fieldset.
      totalText = await page.evaluate(element => {
        const {tagName, ariaLabel} = element;
        let ownText: string | null = '';
        if (['A', 'BUTTON'].includes(tagName)) {
          ownText = element.textContent;
        }
        else if (tagName === 'INPUT' && element.type === 'submit') {
          ownText = element.value;
        }
        // HTML link elements have no labels property.
        const labels = tagName !== 'A' ? Array.from(element.labels!) : [];
        const labelTexts = labels.map(label => label.textContent);
        if (ariaLabel) {
          labelTexts.push(ariaLabel);
        }
        const refIDs = new Set([
          element.getAttribute('aria-labelledby') || '',
          element.getAttribute('aria-describedby') || ''
        ].join(' ').split(/\s+/));
        if (refIDs.size) {
          refIDs.forEach(id => {
            const labeler = document.getElementById(id);
            if (labeler) {
              const labelerText = labeler.textContent!.trim();
              if (labelerText.length) {
                labelTexts.push(labelerText);
              }
            }
          });
        }
        let legendText: string | null = '';
        if (tagName === 'INPUT') {
          const fieldsets = Array.from(document.body.querySelectorAll('fieldset'));
          const inputFieldsets = fieldsets.filter(fieldset => {
            const inputs = Array.from(fieldset.querySelectorAll('input'));
            return inputs.length && inputs[0] === element;
          });
          const inputFieldset = inputFieldsets[0] || null;
          if (inputFieldset) {
            const legend = inputFieldset.querySelector('legend');
            if (legend) {
              legendText = legend.textContent;
            }
          }
        }
        return [legendText].concat(labelTexts, ownText).join(' ');
        // The input element type covers the properties read; a link or button lacks only some.
      }, element as ElementHandle<HTMLInputElement>);
    }
    // Otherwise, if it is an option:
    else if (tagName === 'OPTION') {
      // Return its text content, prefixed with the text of its select parent if the first option.
      const ownText = await element.textContent() as string;
      const indexJSHandle = await element.getProperty('index');
      const index = await indexJSHandle.jsonValue();
      if (index) {
        totalText = ownText;
      }
      else {
        const selectJSHandle = await page.evaluateHandle(
          element => element.parentElement, element
        );
        const select = await selectJSHandle.asElement();
        if (select) {
          const selectText = await textOf(page, select);
          totalText = [ownText, selectText].join(' ');
        }
        else {
          totalText = ownText;
        }
      }
    }
    // Otherwise, i.e. if it is not an input, select, or option:
    else {
      // Get its text content.
      totalText = await element.textContent() as string;
    }
    return debloat(totalText);
  }
  else {
    return null;
  }
};
// Adds a wait error result to an act.
const waitError = (page: Page, act: Act, error: unknown, what: string): boolean => {
  console.log(`ERROR waiting for ${what} (${(error as Error).message})`);
  act.result!.found = false;
  act.result!.url = page.url();
  act.result!.error = `ERROR waiting for ${what}`;
  return false;
};
// Performs one act on a live page and returns the page (which a page act replaces).
export const doInteractionAct = async ({
  page, report, act, actIndex, actCount = 0, interaction = defaultInteraction
}: InteractionActOptions): Promise<Page> => {
  const {goTo, wait} = getLaunch();
  const {type} = act;
  /*
    This file is strict since its conversion (issue #73), so an assignment to a property of a
    primitive act, report.target or report.jobData now throws where it was silently ignored.
    Neither can happen: job validation (procs/job.js) requires a string type on every act and an
    object target, and run.js creates jobData as an object.
  */
  // The modality is recorded for the future modalities; only 'efficient' exists today.
  act.modality = interaction.modality;
  if (type === 'url') {
    // Identify the URL.
    const requestedURL = act.which!.replace('__dirname', __dirname);
    // Visit it and wait until the DOM is loaded.
    const navResult = await goTo(report, page, requestedURL, 15000, 'domcontentloaded');
    // If the visit succeeded:
    if (navResult.success) {
      // Revise the temporary report URL to this URL.
      report.target!.url = requestedURL;
      // Add the resulting URL to the act.
      act.result = {success: true, url: page.url()};
    }
    // Otherwise, i.e. if the visit failed (goTo reports a prohibited redirection as a failure):
    else {
      // Report this.
      addError(true, false, report, actIndex, `ERROR: Visit failed (${navResult.error})`);
    }
  }
  // Otherwise, if the act is a wait for text:
  else if (type === 'wait') {
    const {what, which} = act;
    console.log(`>> ${what}`);
    const result: Record<string, unknown> = act.result = {};
    // If the text is to be the URL:
    if (what === 'url') {
      // Wait for the URL to be the exact text.
      try {
        await page.waitForURL(which!, {timeout: 15000});
        result.found = true;
        result.url = page.url();
      }
      // If the wait times out:
      catch(error) {
        // Report this.
        waitError(page, act, error, 'text in the URL');
      }
    }
    // Otherwise, if the text is to be a substring of the page title:
    else if (what === 'title') {
      // Wait for the page title to include the text, case-insensitively.
      try {
        await page.waitForFunction(
          text => document
          && document.title
          && document.title.toLowerCase().includes(text.toLowerCase()),
          which as string,
          {
            polling: 1000,
            timeout: 5000
          }
        );
        result.found = true;
        result.title = await page.title();
      }
      // If the wait times out:
      catch(error) {
        // Report this.
        waitError(page, act, error, 'text in the title');
      }
    }
    // Otherwise, if the text is to be a substring of the text of the page body:
    else if (what === 'body') {
      // Wait for the body to include the text, case-insensitively.
      try {
        await page.waitForFunction(
          text => document
          && document.body
          && document.body.innerText.toLowerCase().includes(text.toLowerCase()),
          which as string,
          {
            polling: 2000,
            timeout: 15000
          }
        );
        result.found = true;
      }
      // If the wait times out:
      catch(error) {
        // Report this.
        waitError(page, act, error, 'text in the body');
      }
    }
  }
  // Otherwise, if the act is a wait for a state:
  else if (type === 'state') {
    // Wait for it.
    const stateIndex = ['loaded', 'idle'].indexOf(act.which!);
    let reached = true;
    await page.waitForLoadState(
      ['domcontentloaded', 'networkidle'][stateIndex] as 'domcontentloaded' | 'networkidle',
      {timeout: [10000, 15000][stateIndex]}
    )
    // If the wait times out:
    .catch(async error => {
      // Report this.
      reached = false;
      console.log(`ERROR waiting for page to be ${act.which} (${error.message})`);
      addError(true, false, report, actIndex, `ERROR waiting for page to be ${act.which}`);
    });
    // Add state data to the act.
    act.result = {
      success: reached,
      state: act.which
    };
  }
  // Otherwise, if the act is a page switch:
  else if (type === 'page') {
    const context = page.context();
    page = await context.waitForEvent('page');
    // Wait until it is idle.
    await page.waitForLoadState('networkidle', {timeout: 15000});
    // Add the resulting URL to the act.
    const result = {
      url: page.url()
    };
    act.result = result;
  }
  // Otherwise, if the page has a URL:
  else if (page.url() && page.url() !== 'about:blank') {
    const url = page.url();
    // Add the URL to the act.
    act.actualURL = url;
    // If the act is a revelation:
    if (type === 'reveal') {
      act.result = {
        success: true
      };
      // Make all elements in the page visible.
      await page.$$eval('body *', elements => {
        elements.forEach(element => {
          const styleDec = window.getComputedStyle(element);
          if (styleDec.display === 'none') {
            element.style.display = 'initial';
          }
          if (['hidden', 'collapse'].includes(styleDec.visibility)) {
            element.style.visibility = 'inherit';
          }
        });
      })
      .catch(error => {
        console.log(`ERROR making all elements visible (${error.message})`);
        act.result!.success = false;
      });
    }
    // Otherwise, if the act is a screenshot:
    else if (type === 'shoot') {
      const {exclusionSelector, colorType, action} = act as {
        exclusionSelector?: string; colorType?: number; action?: string
      };
      // Make and dispose of a full-page screenshot, masking any excluded element. Without a valid
      // colorType, the image is RGBA (6), as it was when the act passed no valid one to shoot.
      const shotInfo = await shoot(page, report, {
        exclusionSelector: exclusionSelector || null,
        colorType: [0, 2, 4, 6].includes(colorType!) ? colorType : 6,
        action: (['return', 'report', 'file'].includes(action!) ? action : 'report') as ShootOptions['action']
      });
      // Add the PNG base-64 encoding, image index, or file path to the act result.
      act.result = shotInfo !== ''
        ? {success: true, shotInfo}
        : {success: false, prevented: true};
    }
    // Otherwise, if the act is a move:
    else if (moves[type]) {
      // The act's own selector (any Playwright selector) replaces the type's element selector.
      const selector = act.selector as string || (
        typeof moves[type] === 'string' ? moves[type] : act.what!
      );
      // Try up to 5 times to:
      act.result = {found: false};
      let selection = {} as ElementHandle<HTMLElement | SVGElement>;
      let tries = 0;
      const slimText = act.which ? debloat(act.which) : '';
      while (tries++ < 5 && ! act.result.found) {
        if (page) {
          // Identify the elements of the specified type.
          const selections = await page.$$(selector);
          // If there are any:
          if (selections.length) {
            // If there are enough to make a match possible:
            if ((act.index as number || 0) < selections.length) {
              // For each element of the specified type:
              let matchCount = 0;
              const selectionTexts = [];
              for (selection of selections) {
                // Add its lower-case text or an empty string to the list of element texts.
                // A move target is a link, button, input, select, option, or other element, so its
                // text is never null.
                const selectionText = slimText ? await textOf(page, selection) as string : '';
                selectionTexts.push(selectionText);
                // If its text includes any specified text, case-insensitively:
                if (selectionText.includes(slimText)) {
                  // If the element has the specified index among such elements:
                  if (matchCount++ === (act.index || 0)) {
                    // Report it as the matching element and stop checking.
                    act.result.found = true;
                    act.result.textSpec = slimText;
                    act.result.textContent = selectionText;
                    break;
                  }
                }
              }
              // If no element satisfied the specifications:
              if (! act.result.found) {
                // Add the failure data to the temporary report.
                act.result.success = false;
                act.result.error = 'exhausted';
                act.result.typeElementCount = selections.length;
                if (slimText) {
                  act.result.textElementCount = --matchCount;
                }
                act.result.message = 'Not enough specified elements exist';
                act.result.candidateTexts = selectionTexts;
              }
            }
            // Otherwise, i.e. if there are too few such elements to make a match possible:
            else {
              // Add the failure data to the temporary report.
              act.result.success = false;
              act.result.error = 'fewer';
              act.result.typeElementCount = selections.length;
              act.result.message = 'Elements of specified type too few';
            }
          }
          // Otherwise, i.e. if there are no elements of the specified type:
          else {
            // Add the failure data to the temporary report.
            act.result.success = false;
            act.result.error = 'none';
            act.result.typeElementCount = 0;
            act.result.message = 'No elements of specified type found';
          }
        }
        // Otherwise, i.e. if the page no longer exists:
        else {
          // Add the failure data to the temporary report.
          act.result.success = false;
          act.result.error = 'gone';
          act.result.message = 'Page gone';
        }
        if (! act.result.found) {
          await wait(2000);
        }
      }
      // If a match was found:
      if (act.result.found) {
        // FUNCTION DEFINITION START
        // Performs a click or Enter keypress and waits for the network to be idle.
        const doAndWait = async (isClick: boolean) => {
          // Perform and report the move.
          const move = isClick ? 'click' : 'Enter keypress';
          try {
            await (isClick
              ? selection.click({timeout: 4000})
              : selection.press('Enter', {timeout: 4000}));
            act.result!.success = true;
            act.result!.move = move;
          }
          // If the move fails:
          catch(error) {
            // Report this. (A search act has already recorded success for its text entry.)
            act.result!.success = false;
            addError(true, false, report, actIndex, `ERROR: ${move} failed`);
          }
          if (act.result!.success) {
            try {
              await page.waitForLoadState('networkidle', {timeout: 10000});
              act.result!.idleTimely = true;
            }
            catch(error) {
              console.log(`ERROR: Network busy after ${move} (${errorStart(error)})`);
              act.result!.idleTimely = false;
            }
            // Add the page URL to the result.
            act.result!.newURL = page.url();
          }
        };
        // FUNCTION DEFINITION END
        // If the move is a button click, perform it.
        if (type === 'button') {
          await selection.click({timeout: 3000});
          act.result.success = true;
          act.result.move = 'clicked';
        }
        // Otherwise, if it is checking a radio button or checkbox, perform it.
        else if (['checkbox', 'radio'].includes(type)) {
          await selection.waitForElementState('stable', {timeout: 2000})
          .catch(error => {
            console.log(`ERROR waiting for stable ${type} (${error.message})`);
            act.result!.success = false;
            act.result!.error = `ERROR waiting for stable ${type}`;
          });
          if (! act.result.error) {
            const isEnabled = await selection.isEnabled();
            if (isEnabled) {
              await selection.check({
                force: true,
                timeout: 2000
              })
              .catch(error => {
                console.log(`ERROR checking ${type} (${error.message})`);
                act.result!.success = false;
                act.result!.error = `ERROR checking ${type}`;
              });
              if (! act.result.error) {
                act.result.success = true;
                act.result.move = 'checked';
              }
            }
            else {
              const message = `ERROR: could not check ${type} because disabled`;
              act.result.success = false;
              act.result.error = message;
            }
          }
        }
        // Otherwise, if it is focusing the element, perform it.
        else if (type === 'focus') {
          await selection.focus();
          act.result.success = true;
          act.result.move = 'focused';
        }
        // Otherwise, if it is clicking a link:
        else if (type === 'link') {
          const href = await selection.getAttribute('href');
          const target = await selection.getAttribute('target');
          act.result.href = href || 'NONE';
          act.result.target = target || 'DEFAULT';
          // If the destination is a new page:
          if (target && target !== '_self') {
            // Click the link and wait for the network to be idle.
            await doAndWait(true);
          }
          // Otherwise, i.e. if the destination is in the current page:
          else {
            // Click the link and wait for the resulting navigation.
            try {
              await selection.click({timeout: 5000});
              // Wait for the new content to load.
              await page.waitForLoadState('domcontentloaded', {timeout: 6000});
              act.result.success = true;
              act.result.move = 'clicked';
              act.result.newURL = page.url();
            }
            // If the click or load failed:
            catch(error) {
              // Report this.
              console.log(`ERROR clicking link (${errorStart(error)})`);
              act.result.success = false;
              act.result.error = 'unclickable';
              act.result.message = 'ERROR: click or load timed out';
            }
            // If the link click succeeded:
            if (! act.result.error) {
              // Add success data to the temporary report.
              act.result.success = true;
              act.result.move = 'clicked';
            }
          }
        }
        // Otherwise, if it is selecting an option in a select list, perform it.
        else if (type === 'select') {
          const options = await selection.$$('option');
          let optionText = '';
          if (options && Array.isArray(options) && options.length) {
            const optionTexts: string[] = [];
            for (const option of options) {
              const optionText = await option.textContent() as string;
              optionTexts.push(optionText);
            }
            const matchTexts = optionTexts.map(
              (text, index) => text.includes(act.what!) ? index : -1
            );
            const index = matchTexts.filter(text => text > -1)[act.index as number || 0];
            if (index !== undefined) {
              await selection.selectOption({index});
              optionText = optionTexts[index];
            }
            // If no option text matches, try the specification as an option value or label.
            else {
              const selected = await selection.selectOption(act.what!, {timeout: 2000})
              .catch(() => []);
              if (selected.length) {
                optionText = act.what!;
              }
            }
          }
          act.result.success = true;
          act.result.move = 'selected';
          act.result.option = optionText;
        }
        // Otherwise, if it is entering text in an input element:
        else if (['text', 'search'].includes(type)) {
          act.result.attributes = {};
          const {attributes} = act.result as {attributes: Record<string, string>};
          const type = await selection.getAttribute('type');
          const label = await selection.getAttribute('aria-label');
          const labelRefs = await selection.getAttribute('aria-labelledby');
          attributes.type = type || '';
          attributes.label = label || '';
          attributes.labelRefs = labelRefs || '';
          // If the text contains a placeholder for an environment variable:
          let {what} = act as {what: string};
          let unsetKey = '';
          if (/__[A-Z]+__/.test(what)) {
            // Replace it, unless the variable is not set.
            const envKey = /__([A-Z]+)__/.exec(what)![1];
            const envValue = process.env[envKey];
            if (envValue === undefined) {
              unsetKey = envKey;
            }
            else {
              what = what.replace(/__[A-Z]+__/, envValue);
            }
          }
          // If the variable is not set, fail the act, naming the variable but no value.
          if (unsetKey) {
            act.result.success = false;
            act.result.error = 'unsetVariable';
            act.result.message = `ERROR: Environment variable ${unsetKey} is not set`;
            console.log(act.result.message);
          }
          // Otherwise:
          else {
            // Enter the text, replacing any existing value if the act says so.
            if (act.clear) {
              await selection.fill(what);
            }
            else {
              await selection.type(what);
            }
            report.jobData!.presses! += what.length;
            act.result.success = true;
            act.result.move = 'entered';
            // If the input is a search input:
            if (type === 'search') {
              // Press the Enter key and wait for a network to be idle.
              await doAndWait(false);
            }
          }
        }
        // Otherwise, i.e. if the move is unknown, add the failure to the act.
        else {
          // Report the error.
          const message = 'ERROR: move unknown';
          act.result.success = false;
          act.result.error = message;
        }
      }
      // Otherwise, i.e. if no match was found:
      else {
        // RLeport this.
        act.result.success = false;
        act.result.error = 'absent';
        act.result.message = 'ERROR: specified element not found';
        console.log('ERROR: Specified element not found');
      }
    }
    // Otherwise, if the act is a keypress:
    else if (type === 'press') {
      // Identify the number of times to press the key.
      let times = 1 + (act.again as number || 0);
      report.jobData!.presses! += times;
      const key = act.which!;
      // Press the key.
      while (times--) {
        await page.keyboard.press(key);
      }
      const qualifier = act.again ? `${1 + (act.again as number)} times` : 'once';
      act.result = {
        success: true,
        message: `pressed ${qualifier}`
      };
    }
    // Otherwise, if it is a repetitive keyboard navigation:
    else if (type === 'presses') {
      const {navKey, what, which, withItems} = act as unknown as PressesAct;
      const matchTexts = which ? which.map(text => debloat(text)) : [];
      // Initialize the loop variables.
      let status = 'more';
      let presses = 0;
      let amountRead = 0;
      let items: PressesItem[] = [];
      let matchedText: string | undefined;
      // As long as a matching element has not been reached:
      while (status === 'more') {
        // Press the Escape key to dismiss any modal dialog.
        await page.keyboard.press('Escape');
        // Press the specified navigation key.
        await page.keyboard.press(navKey);
        presses++;
        // Identify the newly current element or a failure, which the status is then set to. (This
        // function runs in the page, where status would mean window.status.)
        const currentJSHandle = await page.evaluateHandle(actCount => {
          // Initialize it as the focused element.
          let currentElement = document.activeElement;
          // If it exists in the page:
          if (currentElement && currentElement.tagName !== 'BODY') {
            // Change it, if necessary, to its active descendant.
            if (currentElement.hasAttribute('aria-activedescendant')) {
              currentElement = document.getElementById(
                currentElement.getAttribute('aria-activedescendant') as string
              );
            }
            // Or change it, if necessary, to its selected option.
            else if (currentElement.tagName === 'SELECT') {
              const currentIndex = Math.max(0, (currentElement as HTMLSelectElement).selectedIndex);
              const options = currentElement.querySelectorAll('option');
              currentElement = options[currentIndex];
            }
            // Or change it, if necessary, to its active shadow-DOM element.
            else if (currentElement.shadowRoot) {
              currentElement = currentElement.shadowRoot.activeElement;
            }
            // If there is a current element:
            if (currentElement) {
              // If it was already reached within this act:
              if ((currentElement as HTMLElement).dataset.pressesReached === actCount.toString(10)) {
                // Report the error.
                console.log(`ERROR: ${currentElement.tagName} element reached again`);
                return 'ERROR: locallyExhausted';
              }
              // Otherwise, i.e. if it is newly reached within this act:
              else {
                // Mark and return it (the dataset converts the number to a string).
                (currentElement as HTMLElement).dataset.pressesReached = actCount as unknown as string;
                return currentElement;
              }
            }
            // Otherwise, i.e. if there is no current element:
            else {
              // Report the error.
              return 'noActiveElement';
            }
          }
          // Otherwise, i.e. if there is no focus in the page:
          else {
            // Report the error.
            return 'ERROR: globallyExhausted';
          }
        }, actCount);
        // If the current element exists:
        const currentElement = currentJSHandle.asElement();
        if (currentElement) {
          // Update the data.
          const tagNameJSHandle = await currentElement.getProperty('tagName');
          const tagName = await tagNameJSHandle.jsonValue();
          const text = await textOf(page, currentElement);
          // If the text of the current element was found:
          if (text !== null) {
            const textLength = text.length;
            // If it is non-empty and there are texts to match:
            if (matchTexts.length && textLength) {
              // Identify the matching text.
              matchedText = matchTexts.find(matchText => text.includes(matchText));
            }
            // Update the item data if required.
            if (withItems) {
              const itemData: PressesItem = {
                tagName,
                text,
                textLength
              };
              if (matchedText) {
                itemData.matchedText = matchedText;
              }
              items.push(itemData);
            }
            amountRead += textLength;
            // If there is no text-match failure:
            if (matchedText || ! matchTexts.length) {
              // If the element has any specified tag name:
              if (! what || tagName === what) {
                // Change the status.
                status = 'done';
                // Perform the action.
                const inputText = act.text as string;
                if (inputText) {
                  await page.keyboard.type(inputText);
                  presses += inputText.length;
                }
                if (act.action) {
                  presses++;
                  await page.keyboard.press(act.action as string);
                  await page.waitForLoadState();
                }
              }
            }
          }
          else {
            status = 'ERROR';
          }
        }
        // Otherwise, i.e. if there was a failure:
        else {
          // Update the status.
          status = await currentJSHandle.jsonValue() as string;
        }
      }
      // Add the result to the act.
      act.result = {
        success: true,
        status,
        totals: {
          presses,
          amountRead
        }
      };
      if (status === 'done' && matchedText) {
        act.result.matchedText = matchedText;
      }
      if (withItems) {
        act.result.items = items;
      }
      // Add the totals to the temporary report.
      report.jobData!.presses! += presses;
      report.jobData!.amountRead! += amountRead;
    }
    // Otherwise, i.e. if the act type is unknown:
    else {
      // Report this.
      addError(true, false, report, actIndex, 'ERROR: Invalid act type');
    }
  }
  // Otherwise, a page URL is required but does not exist, so:
  else {
    // Report this.
    addError(true, false, report, actIndex, 'ERROR: Page has no URL');
  }
  return page;
};
// Re-enacts the acts that reached a checkpoint, on a freshly navigated page, and returns the
// page. Throws if an act fails, naming the act. The recorded acts are not modified: clones are
// performed, against a copy of the report whose counters are discarded.
export const replayActs = async (
  page: Page, report: Report, checkpoint: Checkpoint
): Promise<{page: Page; elapsedMs: number; actCount: number}> => {
  const startTime = Date.now();
  const replayReport: Report = {
    ... report,
    target: {... report.target} as Report['target'],
    jobData: {... report.jobData, presses: 0, amountRead: 0},
    acts: report.acts.map(act => ({... act}))
  };
  const interaction = checkpoint.interaction || defaultInteraction;
  for (const actIndex of checkpoint.replay) {
    const act = replayReport.acts[actIndex];
    // Deleted through an assertion, so that the checker does not take the result to stay deleted
    // after doInteractionAct adds one.
    delete (act as Act).result;
    delete act.actualURL;
    page = await doInteractionAct({
      page, report: replayReport, act, actIndex, actCount: actIndex, interaction
    });
    const failed = act.result && (act.result.success === false || act.result.found === false);
    if (failed || replayReport.jobData!.aborted) {
      const reason = act.result?.error || act.result?.message || replayReport.jobData!.abortMessage
      || 'unknown';
      throw new Error(`checkpoint replay failed at act ${actIndex} (${act.type}: ${reason})`);
    }
  }
  return {page, elapsedMs: Date.now() - startTime, actCount: checkpoint.replay.length};
};
