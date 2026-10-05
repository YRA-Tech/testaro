/*
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.
  Licensed under the MIT License. See LICENSE for details.
*/

// IMPORTS

import type {Page} from 'playwright';
import {applyMultiplier, getScroll, ruleLaunchRetries} from '../procs/config';
import {browserClose, launch} from '../procs/launch';
import {getXPathCatalogIndex} from '../procs/xPath';
import type {Report, StandardInstance} from '../types';
// pixelmatch and pngjs ship no bundled declarations, so their imports stay requires, untyped.
const pixelmatch = require('pixelmatch').default;
const {PNG} = require('pngjs');

/*
  motion
  This test reports motion in a page by making three images of it during one visit and comparing them.

  For minimal accessibility, standards require motion to be brief, or else stoppable by the user. But stopping motion can be difficult or impossible, and, by the time a user manages to stop motion, the motion may have caused annoyance or harm. For superior accessibility, a page contains no motion until and unless the user authorizes it.

  The rule is concurrent (see allRules in tests/testaro.ts): it runs while the serial rules run, on a page of its own. That page has a tall viewport (a multiple of the device viewport height, capped so the image stays within browser limits), so that motion below the fold, including motion that a page starts only when it becomes visible, is in view. After the page loads, the rule waits for a grace period, makes the first image, and makes two more images at intervals. Any change after the grace period is motion as a user sees it, including content that arrives late. A change between the second and third images is continuing motion; a change only between the first and second is a one-time change after loading. The larger the changed area, measured as a fraction of one device screen (and so possibly exceeding 1), the greater the ordinal severity, and continuing motion is one level more severe.

  The grace period begins when the page fires its load event (or, at a later checkpoint, when the acts of the checkpoint have been replayed). The act may override the grace period and the interval, in milliseconds, with args: {motion: [graceMs, intervalMs]}. Neither is scaled by TIMEOUT_MULTIPLIER, because they define motion rather than limit time.

  Compiled to motion.js by tsc (issue #73); edit this file, not the emitted one.
*/

// CONSTANTS

// Default time in milliseconds after loading before the first image.
const defaultGraceMs = 1500;
// Default time in milliseconds between images.
const defaultIntervalMs = 5000;
// Count of images.
const shotCount = 3;
// Multiple of the device viewport height that is the height of the tall viewport.
const viewportMultiple = 8;
// Maximum height of the tall viewport in device pixels, below the browser capture limit.
const maxDeviceHeight = 16000;
// Time in milliseconds to wait for the load event if the launch returned before it.
const loadWaitMs = 10000;

// FUNCTIONS

// Waits for a time, ending early with an error if the signal aborts.
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) {
    reject(new Error('Aborted'));
    return;
  }
  let timer: NodeJS.Timeout | undefined;
  // On abortion, stop waiting.
  const onAbort = () => {
    clearTimeout(timer);
    reject(new Error('Aborted'));
  };
  timer = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, ms);
  signal?.addEventListener('abort', onAbort, {once: true});
});
// Returns the count of pixels that differ between two PNG images, decoding them only here so the decoded images can be collected as soon as this returns.
const getChangeCount = (pngA: Buffer, pngB: Buffer): number => {
  const imageA = PNG.sync.read(pngA);
  const imageB = PNG.sync.read(pngB);
  // If the dimensions differ, all pixels are deemed changed.
  if (imageA.width !== imageB.width || imageA.height !== imageB.height) {
    return imageB.width * imageB.height;
  }
  return pixelmatch(imageA.data, imageB.data, null, imageA.width, imageA.height, {threshold: 0.1});
};
// Returns an ordinal severity from a changed area as a fraction of a screen.
const getSeverity = (fraction: number) => fraction < 0.001 ? 0 : fraction < 0.01 ? 1 : fraction < 0.1 ? 2 : 3;
// Returns a changed area as a percentage of a screen.
const percent = (fraction: number) => `${Number((100 * fraction).toPrecision(2))}%`;
// Returns the time in milliseconds since the anchor of the grace period, i.e. the load event or the launch, waiting for the load event if necessary.
const getSinceAnchor = async (page: Page, report: Report, launchedAt: number) => {
  // At a later checkpoint, the anchor is the end of the replay, i.e. the launch.
  if (report.activeCheckpoint) {
    return {sinceAnchor: Date.now() - launchedAt, loadMs: null};
  }
  // Gets the end of the load event and the current time in the page.
  const getTimes = () => page.evaluate(() => {
    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return {loadEnd: navEntry?.loadEventEnd ?? 0, now: performance.now()};
  });
  let times = await getTimes();
  // If the page has not finished loading:
  if (! times.loadEnd) {
    // Wait for it to finish loading, within a limit.
    await page.waitForLoadState('load', {timeout: applyMultiplier(loadWaitMs)}).catch(() => {});
    times = await getTimes();
  }
  // If it has finished loading, the anchor is the end of loading.
  if (times.loadEnd) {
    return {sinceAnchor: times.now - times.loadEnd, loadMs: Math.round(times.loadEnd)};
  }
  // Otherwise, the anchor is the launch.
  return {sinceAnchor: Date.now() - launchedAt, loadMs: null};
};
// Runs the test and returns the result.
export const reporter = async (
  _page: undefined,
  report: Report,
  actIndex: number,
  _withItems: boolean,
  signal?: AbortSignal,
  graceMs: number = defaultGraceMs,
  intervalMs: number = defaultIntervalMs
) => {
  // Initialize the data, totals, and standard instances.
  const data: Record<string, unknown> = {graceMs, intervalMs, prescanScroll: getScroll(report)};
  const totals = [0, 0, 0, 0];
  const standardInstances: StandardInstance[] = [];
  // Get the dimensions of the tall viewport from those of the device.
  const windowOptions = (report.device?.windowOptions ?? {}) as {
    viewport?: {width: number; height: number};
    deviceScaleFactor?: number;
  };
  const deviceViewport = windowOptions.viewport ?? {width: 1920, height: 1080};
  const scaleFactor = windowOptions.deviceScaleFactor ?? 1;
  const viewport = {
    width: deviceViewport.width,
    height: Math.min(viewportMultiple * deviceViewport.height, Math.floor(maxDeviceHeight / scaleFactor))
  };
  data.viewport = viewport;
  // The area of one screen of the device, the unit of changed areas.
  const screenArea = deviceViewport.width * deviceViewport.height;
  const act = report.acts[actIndex] as {retries?: number};
  let page: Page | null = null;
  // On abortion (i.e. a timeout), close the page, ending any pending operation on it.
  const onAbort = () => {
    browserClose(page);
  };
  signal?.addEventListener('abort', onAbort, {once: true});
  try {
    // Launch a browser with the tall viewport and visit the page, without the XPath script, which the test does not need. At a later checkpoint, use the script, so the wait suits the replay.
    const launchedPage = await launch({
      report,
      actIndex,
      xPathNeed: report.activeCheckpoint ? 'script' : 'none',
      contextOverrides: {viewport},
      retries: Number.isInteger(act.retries) && (act.retries as number) >= 0
        ? act.retries as number
        : ruleLaunchRetries
    }) as Page | null;
    const launchedAt = Date.now();
    page = launchedPage;
    // If the rule timed out during the launch, stop (the page is closed below).
    if (signal?.aborted) {
      throw new Error('Aborted');
    }
    // If the launch failed:
    if (! page) {
      // Report this.
      data.prevented = true;
      data.error = 'Launch failed';
    }
    // Otherwise, if it succeeded:
    else {
      const {sinceAnchor, loadMs} = await getSinceAnchor(page, report, launchedAt);
      data.loadMs = loadMs;
      // Wait for the rest of the grace period.
      await sleep(Math.max(0, graceMs - sinceAnchor), signal);
      const firstShotAt = Date.now();
      const shotTimes: number[] = [];
      const changes: number[] = [];
      let priorPNG: Buffer | null = null;
      // For each image:
      for (let shotIndex = 0; shotIndex < shotCount; shotIndex++) {
        // If it is not the first, wait for the interval.
        if (shotIndex) {
          await sleep(intervalMs, signal);
        }
        // Make it.
        const png: Buffer = await page.screenshot({
          fullPage: false,
          scale: 'css',
          type: 'png',
          timeout: applyMultiplier(10000)
        });
        shotTimes.push(Math.round(Date.now() - firstShotAt + Math.max(graceMs, sinceAnchor)));
        // If it is not the first, compare it with the prior one.
        if (priorPNG) {
          changes.push(getChangeCount(priorPNG, png) / screenArea);
        }
        // Keep only it for the next comparison.
        priorPNG = png;
      }
      priorPNG = null;
      data.scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      data.shotTimes = shotTimes;
      // The changed areas between consecutive images, as fractions of a screen.
      data.changes = changes;
      const [firstChange, secondChange] = changes;
      let violationWhat = '';
      let ordinalSeverity = 0;
      // If the page changed between the second and third images:
      if (secondChange) {
        // Describe continuing motion.
        violationWhat = `Content changes spontaneously and continually (changed area between the last 2 images equal to ${percent(secondChange)} of a screen)`;
        ordinalSeverity = Math.min(3, getSeverity(secondChange) + 1);
      }
      // Otherwise, if it changed only between the first and second images:
      else if (firstChange) {
        // Describe a one-time change.
        violationWhat = `Content changes spontaneously after loading (changed area equal to ${percent(firstChange)} of a screen)`;
        ordinalSeverity = getSeverity(firstChange);
      }
      // If there was a violation:
      if (violationWhat) {
        // Add to the totals.
        totals[ordinalSeverity] = 1;
        // Get a summary standard instance.
        standardInstances.push({
          ruleID: 'motion',
          what: violationWhat,
          ordinalSeverity: ordinalSeverity as StandardInstance['ordinalSeverity'],
          count: 1,
          catalogIndex: getXPathCatalogIndex(report, '/html/body')
        });
      }
    }
  }
  finally {
    signal?.removeEventListener('abort', onAbort);
    // Close the page.
    await browserClose(page);
  }
  // Return the result.
  return {
    data,
    totals,
    standardInstances
  };
};
