/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import {createHash} from 'crypto';
import type {Page} from 'playwright';
import {catalogPage, getAriaSnapshot, pruneCheckpoint} from './catalog';
import {getStructureDiff} from './scope';
import {shoot} from './shoot';
import type {Catalog, Checkpoint, Interaction, Report} from '../types';

/*
  checkpoint
  Creates checkpoints: snapshots of page states reached by a job's acts. See
  docs/checkpoint-scanning.md. Compiled to checkpoint.js by tsc (issue #73); edit this file,
  not the emitted one.
*/

// TYPES

// A report that getCatalog has given a catalog and checkpoint 0, as a checkpoint act needs.
export type CatalogedReport = Report & {catalog: Catalog; checkpoints: Checkpoint[]};
// The arguments of makeCheckpoint.
export interface CheckpointOptions {
  page: Page;
  report: CatalogedReport;
  name: string;
  actIndex: number | null;
  implicit: boolean;
  launchActIndex: number | null;
  launchURL: string;
  replay: number[];
  interaction: Interaction;
}

// FUNCTIONS

// Returns a digest of the page's DOM, ignoring the attributes Testaro adds and whitespace, so
// that a replayed page can be compared with the snapshot it re-enacts.
export const getDomDigest = async (page: Page): Promise<string> => {
  try {
    const content = await page.content();
    const normalized = content
    .replace(/ data-xpath="[^"]*"/g, '')
    .replace(/ data-testaro-opened=""/g, '')
    .replace(/\s+/g, ' ');
    return createHash('sha1').update(normalized).digest('hex');
  }
  catch(error) {
    console.log(`ERROR: DOM digest failed (${(error as Error).message})`);
    return '';
  }
};
/*
  Creates a checkpoint from the live page, adds it to the report, and returns it.

  Strict mode: report.pathIDs is assigned to, which would throw if it were a primitive. It
  cannot be: getCatalog sets it to an object whenever it sets report.checkpoints, and the
  caller (doActs) needs report.checkpoints. Only a job that supplied both itself could reach
  here with a primitive, and doActs catches the error.
*/
export const makeCheckpoint = async ({
  page, report, name, actIndex, implicit, launchActIndex, launchURL, replay, interaction
}: CheckpointOptions): Promise<Checkpoint> => {
  const startTime = Date.now();
  const index = report.checkpoints.length;
  const imageIndexes: number[] = [];
  // If page images are required:
  if ([0, 2, 4, 6].includes(report.imageColor as number)) {
    const imageScale = Number.isFinite(report.imageScale) && (report.imageScale as number) > 1
      ? report.imageScale as number
      : 1;
    // Create one at CSS scale, and one at device scale if the job asks for it.
    const cssIndex = await shoot(page, report, {
      exclusionSelector: '',
      colorType: report.imageColor,
      action: 'report'
    });
    if (typeof cssIndex === 'number') {
      imageIndexes.push(cssIndex);
    }
    if (imageScale > 1) {
      const deviceIndex = await shoot(page, report, {
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
  const snapshot = await catalogPage(page, report, {checkpoint: index, restoreDetails: true});
  Object.assign(report.catalog, snapshot.entries);
  report.pathIDs ??= {};
  report.pathIDs[index] = snapshot.pathIDs;
  report.catalogNextIndex = snapshot.nextIndex;
  const checkpoint: Checkpoint = {
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
    ariaSnapshot: await getAriaSnapshot(page),
    domDigest: await getDomDigest(page),
    elapsedMs: Date.now() - startTime,
    testActs: []
  };
  report.checkpoints.push(checkpoint);
  // If there is a previous checkpoint, record what changed since it (job-time; report.flow
  // takes it over at job end), then prune the previous checkpoint's uncited entries, which
  // no later test act can cite.
  if (index > 0) {
    checkpoint.structure = getStructureDiff(report, index - 1, index);
    const prunedCount = pruneCheckpoint(report, index - 1);
    console.log(`Pruned ${prunedCount} uncited catalog entries of checkpoint ${index - 1}`);
  }
  return checkpoint;
};
