"use strict";
/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeCheckpoint = exports.getDomDigest = void 0;
// IMPORTS
const crypto_1 = require("crypto");
const catalog_1 = require("./catalog");
const scope_1 = require("./scope");
const shoot_1 = require("./shoot");
// FUNCTIONS
// Returns a digest of the page's DOM, ignoring the attributes Testaro adds and whitespace, so
// that a replayed page can be compared with the snapshot it re-enacts.
const getDomDigest = async (page) => {
    try {
        const content = await page.content();
        const normalized = content
            .replace(/ data-xpath="[^"]*"/g, '')
            .replace(/ data-testaro-opened=""/g, '')
            .replace(/\s+/g, ' ');
        return (0, crypto_1.createHash)('sha1').update(normalized).digest('hex');
    }
    catch (error) {
        console.log(`ERROR: DOM digest failed (${error.message})`);
        return '';
    }
};
exports.getDomDigest = getDomDigest;
/*
  Creates a checkpoint from the live page, adds it to the report, and returns it.

  Strict mode: report.pathIDs is assigned to, which would throw if it were a primitive. It
  cannot be: getCatalog sets it to an object whenever it sets report.checkpoints, and the
  caller (doActs) needs report.checkpoints. Only a job that supplied both itself could reach
  here with a primitive, and doActs catches the error.
*/
const makeCheckpoint = async ({ page, report, name, actIndex, implicit, launchActIndex, launchURL, replay, interaction }) => {
    const startTime = Date.now();
    const index = report.checkpoints.length;
    const imageIndexes = [];
    // If page images are required:
    if ([0, 2, 4, 6].includes(report.imageColor)) {
        const imageScale = Number.isFinite(report.imageScale) && report.imageScale > 1
            ? report.imageScale
            : 1;
        // Create one at CSS scale, and one at device scale if the job asks for it.
        const cssIndex = await (0, shoot_1.shoot)(page, report, {
            exclusionSelector: '',
            colorType: report.imageColor,
            action: 'report'
        });
        if (typeof cssIndex === 'number') {
            imageIndexes.push(cssIndex);
        }
        if (imageScale > 1) {
            const deviceIndex = await (0, shoot_1.shoot)(page, report, {
                exclusionSelector: '',
                colorType: report.imageColor,
                action: 'report',
                scale: 'device'
            });
            if (typeof deviceIndex === 'number') {
                imageIndexes.push(deviceIndex);
            }
        }
    }
    // Catalog the page as this checkpoint, keeping the live page's state.
    const snapshot = await (0, catalog_1.catalogPage)(page, report, { checkpoint: index, restoreDetails: true });
    Object.assign(report.catalog, snapshot.entries);
    report.pathIDs ??= {};
    report.pathIDs[index] = snapshot.pathIDs;
    report.catalogNextIndex = snapshot.nextIndex;
    const checkpoint = {
        index,
        name,
        implicit,
        actIndex,
        launchActIndex,
        launchURL,
        replay,
        interaction,
        kind: replay.length ? 'interaction' : 'navigation',
        url: page.url(),
        title: await page.title().catch(() => ''),
        imageIndexes,
        catalogRange: [snapshot.firstIndex, snapshot.nextIndex - 1],
        elementCount: snapshot.elementCount,
        ariaSnapshot: await (0, catalog_1.getAriaSnapshot)(page),
        domDigest: await (0, exports.getDomDigest)(page),
        elapsedMs: Date.now() - startTime,
        testActs: []
    };
    report.checkpoints.push(checkpoint);
    // If there is a previous checkpoint, record what changed since it (job-time; report.flow
    // takes it over at job end), then prune the previous checkpoint's uncited entries, which
    // no later test act can cite.
    if (index > 0) {
        checkpoint.structure = (0, scope_1.getStructureDiff)(report, index - 1, index);
        const prunedCount = (0, catalog_1.pruneCheckpoint)(report, index - 1);
        console.log(`Pruned ${prunedCount} uncited catalog entries of checkpoint ${index - 1}`);
    }
    return checkpoint;
};
exports.makeCheckpoint = makeCheckpoint;
