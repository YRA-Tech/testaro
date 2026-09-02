"use strict";
/*
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.pruneCatalog = exports.getCatalog = exports.catalogPage = exports.getAriaSnapshot = void 0;
// Module to close and launch browsers.
const launch_1 = require("./launch");
const shoot_1 = require("./shoot");
// Function to define window.getXPath on a live page.
const xPathScript_1 = require("./xPathScript");
// CONSTANTS
// The ARIA snapshot of a page, for checkpoints; empty if the browser cannot make one.
const getAriaSnapshot = async (page) => {
    try {
        return await page.locator('body').ariaSnapshot();
    }
    catch (error) {
        console.log(`ERROR: ARIA snapshot failed (${error.message})`);
        return '';
    }
};
exports.getAriaSnapshot = getAriaSnapshot;
// FUNCTIONS
// Catalogs the elements of a live page and returns the snapshot. Expands closed details
// elements first, so box measurements agree with a page image taken in the same state; with
// restoreDetails, closes them again afterward so a live page keeps its state.
const catalogPage = async (page, report, { checkpoint, restoreDetails }) => {
    // Ensure the page can compute XPaths (a page launched for acts lacks the script).
    await (0, xPathScript_1.defineGetXPath)(page);
    // Expand closed details elements before the page image and the box measurements, so
    // both see the same fully disclosed state. Chromium lays out the content of a closed
    // details element (content-visibility: hidden) without painting it and without
    // shifting the content after it, so getBoundingClientRect returns coordinates that
    // overlap unrelated visible elements, making box IDs disagree with the page image.
    await page.evaluate(() => {
        document.querySelectorAll('details:not([open])').forEach(details => {
            details.setAttribute('open', '');
            details.setAttribute('data-testaro-opened', '');
        });
    }).catch(error => {
        console.log(`ERROR: Expanding details elements failed (${error.message})`);
    });
    const startIndex = report.catalogNextIndex ?? 0;
    // Get a catalog of the elements in the page and a map of path IDs to catalog indexes.
    console.log(`Creating catalog for checkpoint ${checkpoint}`);
    const { cat: entries, pathIDs, elementCount } = await page.evaluate(({ startIndex, checkpoint }) => {
        // HTMLElement covers the innerText reads below; SVG-only members are guarded.
        const elements = Array.from(document.querySelectorAll('*'));
        // Initialize a catalog.
        const cat = {};
        // Initialize a map of path IDs to catalog indexes.
        const pathIDs = {};
        // Initialize a directory of text fragments.
        const texts = {};
        // Initialize the index of the current heading.
        let headingIndex = '';
        // For each element in the page:
        // Iterate by numeric index rather than `for...in`. `for...in` over this
        // array also enumerates any enumerable members added to Array.prototype
        // by the TARGET page's own scripts (e.g. legacy MooTools/Prototype-style
        // extensions); `element` then becomes that injected value and the
        // element.closest(...) call below throws "closest is not a function",
        // aborting the entire catalog and the job. The indexed loop sees only
        // real elements. `index` is kept as a string so the catalog keys
        // (cat[index], texts[...].push(index)) are unchanged.
        for (let i = 0; i < elements.length; i++) {
            const index = String(startIndex + i);
            const element = elements[i];
            // Get its ID and tag name.
            const { id, tagName } = element;
            // Get its start tag.
            const startTag = element.outerHTML?.replace(/^.*?</s, '<').replace(/>.*$/s, '>') ?? '';
            // Get whether it is eligible for text-fragment acquisition.
            const isTextable = element.closest('body')
                && !element.closest('svg')
                && !['SCRIPT', 'STYLE', 'svg'].includes(element.tagName);
            const innerText = isTextable
                ? element.innerText.trim() || (element.parentElement?.innerText?.trim() ?? '')
                : '';
            let text = '';
            // If it is eligible and has an inner text:
            if (innerText) {
                const segments = innerText?.split('\n') ?? [];
                const tidySegments = segments.map(segment => segment.trim().replace(/\s+/g, ' '));
                const neededSegments = tidySegments.filter(segment => segment.length);
                neededSegments.splice(1, neededSegments.length - 2);
                // Get its text fragments.
                text = neededSegments.join('\n');
                // Add its index to the directory of text fragments.
                texts[text] ??= [];
                texts[text].push(index);
            }
            // Get its bounding box, but only if the element is painted. Chromium reports
            // plausible nonzero boxes for laid-out but unpainted content (visibility: hidden
            // and content-visibility: hidden subtrees), and such a box disagrees with the
            // page image, overlapping unrelated visible elements.
            const isVisible = typeof element.checkVisibility === 'function'
                ? element.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true })
                : true;
            const domRect = isVisible ? element.getBoundingClientRect() : null;
            // Get its box ID.
            const boxID = domRect
                ? ['x', 'y', 'width', 'height'].map(key => Math.round(domRect[key])).join(':')
                : '';
            // Get its path ID.
            const pathID = window.getXPath(element) ?? '/html';
            // If it is a heading that nullifies an existing current heading index:
            if (headingIndex
                && ['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tagName)
                && cat[headingIndex].tagName >= tagName) {
                // Nullify the current heading index.
                headingIndex = '';
            }
            // Add an entry for it to the catalog.
            cat[index] = {
                tagName,
                id: id || '',
                startTag,
                text,
                textLinkable: false,
                boxID,
                pathID,
                headingIndex,
                checkpoint
            };
            // If the element is a heading:
            if (['H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tagName)) {
                // Assign its index to the current heading index.
                headingIndex = index;
            }
            // Add the path ID to the map of path IDs.
            pathIDs[pathID] = index;
        }
        // For each text in the catalog:
        Object.keys(texts).forEach(text => {
            const textElementIndexes = texts[text].sort((a, b) => Number(a) - Number(b));
            // If every element that has it is in the same subtree, so the text is page-unique:
            if (textElementIndexes.slice(0, -1).every((elementIndex, index) => cat[textElementIndexes[index + 1]]
                .pathID
                .startsWith(cat[elementIndex].pathID))) {
                // For each element that has it:
                textElementIndexes.forEach(index => {
                    // If it is not in the head, a script, a style, or a noscript element:
                    if (!['/head[1]', '/script[', '/style[', '/noscript[']
                        .some(excluder => cat[index].pathID.includes(excluder))) {
                        // Mark it as linkable in the element data in the catalog.
                        cat[index].textLinkable = true;
                    }
                });
            }
        });
        return { cat, pathIDs, elementCount: elements.length };
    }, { startIndex, checkpoint });
    // If the page is to keep its state, close the details elements that were opened.
    if (restoreDetails) {
        await page.evaluate(() => {
            document.querySelectorAll('details[data-testaro-opened]').forEach(details => {
                details.removeAttribute('open');
                details.removeAttribute('data-testaro-opened');
            });
        }).catch(() => { });
    }
    return {
        entries,
        pathIDs,
        firstIndex: startIndex,
        nextIndex: startIndex + elementCount,
        elementCount
    };
};
exports.catalogPage = catalogPage;
// Creates and returns a catalog.
const getCatalog = async (report) => {
    const { browserID } = report;
    const targetURL = report.target?.url;
    // Image scale factor (report.imageScale). When greater than 1, the catalog context
    // runs at that deviceScaleFactor and a supplemental page image is captured at device
    // scale, i.e. with imageScale times the pixels of the CSS layout. Box IDs are
    // CSS-pixel regardless, because getBoundingClientRect reports CSS pixels by
    // definition; consumers map them onto the supplemental image by multiplying by
    // imageScale. Omitted, 1, or invalid values keep the behavior identical to before
    // this option existed.
    const imageScale = Number.isFinite(report.imageScale) && report.imageScale > 1
        ? report.imageScale
        : 1;
    // If the report specifies a global browser ID and a global target URL:
    if (browserID && targetURL) {
        // Launch a browser and visit the target, or abort the job on failure.
        const page = await (0, launch_1.launch)({
            report,
            actIndex: null,
            tempBrowserID: browserID,
            tempURL: targetURL,
            contextOverrides: imageScale > 1 ? { deviceScaleFactor: imageScale } : {}
        });
        // If the launch and navigation succeeded:
        if (page) {
            const startTime = Date.now();
            // If a page image is required:
            if ([0, 2, 4, 6].includes(report.imageColor)) {
                // Expand closed details elements first, so the image and the box measurements below
                // see the same fully disclosed state (catalogPage expands them again, idempotently).
                await page.evaluate(() => {
                    document.querySelectorAll('details:not([open])').forEach(details => {
                        details.setAttribute('open', '');
                    });
                }).catch(error => {
                    console.log(`ERROR: Expanding details elements failed (${error.message})`);
                });
                // Create one at CSS-pixel scale and add it to the report as images[0]. This
                // scale is invariant to imageScale and to the context's deviceScaleFactor, so
                // the testaro motion rule, which compares its own CSS-scale screenshot with
                // images[0], is unaffected by the imageScale option.
                console.log('Creating page image');
                await (0, shoot_1.shoot)(page, report, {
                    exclusionSelector: '',
                    colorType: report.imageColor,
                    action: 'report'
                });
                // If a supersampled page image is also required:
                if (imageScale > 1) {
                    // Create one at device-pixel scale and add it to the report as images[1].
                    console.log(`Creating page image at ${imageScale}x device scale`);
                    await (0, shoot_1.shoot)(page, report, {
                        exclusionSelector: '',
                        colorType: report.imageColor,
                        action: 'report',
                        scale: 'device'
                    });
                }
            }
            // Snapshot the page as checkpoint 0.
            const snapshot = await (0, exports.catalogPage)(page, report, { checkpoint: 0, restoreDetails: false });
            report.catalog = snapshot.entries;
            report.pathIDs = { 0: snapshot.pathIDs };
            report.catalogNextIndex = snapshot.nextIndex;
            // Record the checkpoint.
            const imageIndexes = (report.images ?? []).map((image, index) => index);
            const checkpoint = {
                index: 0,
                name: 'start',
                implicit: false,
                actIndex: null,
                launchActIndex: null,
                launchURL: page.url(),
                replay: [],
                interaction: { modality: 'efficient' },
                kind: 'navigation',
                url: page.url(),
                title: await page.title().catch(() => ''),
                imageIndexes,
                catalogRange: [snapshot.firstIndex, snapshot.nextIndex - 1],
                elementCount: snapshot.elementCount,
                ariaSnapshot: await (0, exports.getAriaSnapshot)(page),
                elapsedMs: Date.now() - startTime,
                testActs: []
            };
            report.checkpoints = [checkpoint];
            const catalog = report.catalog;
            // Close the browser and its context.
            await (0, launch_1.browserClose)(page);
            // Return the catalog.
            return catalog;
        }
        // Otherwise, i.e. if the launch or navigation failed, report and return this.
        console.log('ERROR: Launch or navigation failure prevented cataloguing and aborted job');
        return {};
    }
    // Otherwise, i.e. if the report specification is incomplete, report and return this.
    console.log('ERROR: Job omits browser ID or target URL, preventing catalog creation');
    return {};
};
exports.getCatalog = getCatalog;
// Prunes a catalog.
const pruneCatalog = (report) => {
    console.log('Pruning catalog');
    // The catalog always exists by pruning time (getCatalog ran at job start).
    const { acts, catalog } = report;
    const citedElementIndexes = new Set();
    // For each act in the report:
    acts.forEach(act => {
        // If it is a test with a standard result:
        if (act.type === 'test' && act.result?.standardResult) {
            // The guard above makes the fallback unreachable and instances present; the
            // expression is kept verbatim from the JavaScript original.
            const { instances } = (act.result?.standardResult ?? []);
            // For each instance of the standard result:
            instances.forEach(instance => {
                const catalogIndex = instance?.catalogIndex;
                // If the instance has a catalog index (an index of '0' counts, so test for presence):
                if (catalogIndex !== undefined && catalogIndex !== '') {
                    // Ensure the index is classified as cited, as a string so it matches the
                    // catalog keys tested below (Object.keys() yields strings).
                    citedElementIndexes.add(String(catalogIndex));
                    const { headingIndex } = catalog[catalogIndex] ?? {};
                    // If the catalog item has a heading index:
                    if (headingIndex) {
                        // Ensure it, too, is classified as cited.
                        citedElementIndexes.add(String(headingIndex));
                    }
                }
            });
        }
    });
    // Delete the temporary job-time properties of the report.
    delete report.pathIDs;
    delete report.catalogNextIndex;
    delete report.activeCheckpoint;
    // For each element in the catalog:
    Object.keys(catalog).forEach(elementIndex => {
        // If it is not cited by any instance or by any cited element:
        if (!citedElementIndexes.has(elementIndex)) {
            // Delete it in the catalog.
            delete catalog[elementIndex];
        }
    });
};
exports.pruneCatalog = pruneCatalog;
