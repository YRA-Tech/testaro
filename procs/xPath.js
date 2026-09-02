"use strict";
/*
  © 2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.getXPathCatalogIndex = exports.getAttributeXPath = exports.getNormalizedXPath = void 0;
/*
  xPath
  Processes element XPaths. Compiled to xPath.js by tsc (issue #73); edit this
  file, not the emitted one.
*/
// FUNCTIONS
// Normalizes an XPath.
const getNormalizedXPath = (xPath) => {
    if (xPath) {
        if (xPath === '/') {
            xPath = '/html';
        }
        xPath = xPath.replace(/^\.\/\//, '/');
        const segments = xPath.split('/');
        // Initialize an array of normalized segments.
        const normalizedSegments = [];
        // For each segment of the XPath:
        segments.forEach(segment => {
            // If the segment is html[1] or body[1]:
            if (/html\[1\]|body\[1\]/.test(segment)) {
                // Add it without its subscript to the array.
                normalizedSegments.push(segment.replace(/\[1\]/, ''));
            }
            // Otherwise, if the segment is empty or html or body or ends with a subscript:
            else if (segment === '' || ['html', 'body'].includes(segment) || segment.endsWith(']')) {
                // Add it to the array.
                normalizedSegments.push(segment);
            }
            // Otherwise, i.e. if the segment is a tag name with no subscript:
            else {
                // Add it with a subscript 1 to the array.
                normalizedSegments.push(`${segment}[1]`);
            }
        });
        // If the final segment contains any nonstandard character:
        if (/[[^\]A-Za-z0-9]/.test(segments[segments.length - 1])) {
            // Remove it.
            normalizedSegments.pop();
        }
        // Return the concatenated segments as the normalized XPath.
        return normalizedSegments.join('/');
    }
    else {
        return '/html';
    }
};
exports.getNormalizedXPath = getNormalizedXPath;
// Gets an XPath from a data-xpath attribute in an HTML excerpt.
const getAttributeXPath = (html) => {
    // If there is no excerpt (e.g. a Nu Html Checker message without an extract):
    if (!html) {
        // Return the fallback XPath, as for an excerpt without a data-xpath attribute.
        return '/html';
    }
    const match = html.match(/ data-xpath="([^" ]+)"/);
    return match ? match[1] : '/html';
};
exports.getAttributeXPath = getAttributeXPath;
// Gets a tag name from an XPath.
const getXPathTagName = (xPath) => {
    return xPath.split('/').pop().replace(/\[.+/, '').toUpperCase();
};
// Gets a catalog index as a string from an XPath, within a checkpoint (the active one by
// default). An XPath the checkpoint's catalog lacks gets a stub entry, keyed from the report's
// monotonic counter so that entries of different checkpoints never collide.
const getXPathCatalogIndex = (report, xPath, checkpoint = report.activeCheckpoint ?? 0) => {
    // The catalog always exists by the time tests cite elements (getCatalog ran first).
    const { catalog } = report;
    report.pathIDs ??= {};
    const pathIDs = (report.pathIDs[checkpoint] ??= {});
    // Get the index of the catalog item with the XPath.
    const index = pathIDs[xPath];
    // If no such item exists (an index of '0' is a match, so test for absence, not falsity):
    if (index === undefined) {
        // Add an item to the catalog, keyed by the counter (or, in a report without one, by the
        // count of items already in it).
        const newIndex = report.catalogNextIndex === undefined
            ? `${Object.keys(catalog).length}`
            : `${report.catalogNextIndex++}`;
        catalog[newIndex] = {
            pathID: xPath,
            tagName: getXPathTagName(xPath),
            checkpoint
        };
        pathIDs[xPath] = newIndex;
        return newIndex;
    }
    return index;
};
exports.getXPathCatalogIndex = getXPathCatalogIndex;
