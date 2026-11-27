"use strict";
/*
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getExtractExcerpt = exports.curate = exports.getContent = void 0;
/*
  nu
  Utilities for Testaro tests nuVal and nuVnu. Compiled to nu.js by tsc (issue #73); edit this
  file, not the emitted one.
*/
// ########## IMPORTS
// Module to get the document source.
const getSource_1 = require("./getSource");
// ########## FUNCTIONS
// Gets the content for a nuVal or nuVnu test.
const getContent = async (page, withSource) => {
    const data = {
        withSource,
        testTarget: null
    };
    // If the specified content type was the page source:
    if (withSource) {
        // Get it.
        const sourceData = await (0, getSource_1.getSource)(page);
        // If the source was not obtained:
        if (sourceData.prevented) {
            // Report this.
            data.prevented = true;
            data.error = sourceData.error;
        }
        // Otherwise, i.e. if it was obtained:
        else {
            // Add it to the data.
            data.testTarget = sourceData.source;
        }
    }
    // Otherwise, i.e. if the specified content type was the Playwright page content:
    else {
        // Add the annotated page content to the data.
        data.testTarget = await page.content();
    }
    // Return the data.
    return data;
};
exports.getContent = getContent;
// Postprocesses a result from nuVal or nuVnu tests; undefined when nuData is falsy.
const curate = async (data, nuData, rules) => {
    let result;
    // If a result was obtained:
    if (nuData) {
        // Delete left and right quotation marks and their erratic invalid replacements.
        const nuDataValid = JSON.stringify(nuData).replace(/[\u{fffd}“”]/ug, '');
        const nuDataClean = JSON.parse(nuDataValid);
        result = nuDataClean;
    }
    // Guarantee result.messages is always an iterable. The W3C API returns
    // {messages: [...]} on success, but on HTTP errors (e.g. 502) or fetch
    // failures nuVal leaves nuData={}, so result becomes {}
    // and `result.messages.filter(...)` below throws
    // "Cannot read properties of undefined (reading 'filter')".
    // The typeof test keeps the behavior of the code before it ran in strict mode (issue #73). If
    // nuData is a string, as when vnu-jar resolves with the raw JSON of a page without messages,
    // result is a string too. The assignment to a property of a string was then silently ignored,
    // and the act failed on result.messages.filter below; in strict mode the assignment itself
    // would throw, with a different error. The failure itself is a pre-existing bug (issue #212).
    if (result && typeof result === 'object' && !Array.isArray(result.messages)) {
        result.messages = [];
    }
    // If there is a result and rules were specified:
    if (result && rules && Array.isArray(rules) && rules.length) {
        // Remove all messages except those specified.
        result.messages = result.messages.filter(message => rules.some(rule => {
            if (rule[0] === '=') {
                return message.message === rule.slice(1);
            }
            else if (rule[0] === '~') {
                return new RegExp(rule.slice(1)).test(message.message);
            }
            else {
                console.log(`ERROR: Invalid nuVal rule ${rule}`);
                return false;
            }
        }));
    }
    // If there is a result:
    if (result) {
        // Remove messages reporting duplicate blank IDs.
        const badMessages = new Set(['Duplicate ID .', 'The first occurrence of ID  was here.']);
        result.messages = result.messages.filter(message => !badMessages.has(message.message));
    }
    // Return the result.
    return result;
};
exports.curate = curate;
// Maximum length of an extract excerpt included in the what property of a standard instance.
const excerptMax = 400;
// Gets an excerpt of the extract of a message for inclusion in the what property of a standard instance, if the element catalog cannot report the extract.
const getExtractExcerpt = (extract) => {
    // If there is no extract, or the extract contains a data-xpath attribute identifying an element:
    if (!extract || / data-xpath="/.test(extract)) {
        // Report that no excerpt is needed, because the catalog reports the element.
        return null;
    }
    // Return the extract (e.g. the erroneous text of a CSS: Parse Error message), truncated if necessary.
    return extract.length > excerptMax ? `${extract.slice(0, excerptMax)} …` : extract;
};
exports.getExtractExcerpt = getExtractExcerpt;
