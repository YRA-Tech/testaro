/*
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.
  Licensed under the MIT License. See LICENSE file for details.
*/

/*
  shoot
  Manages the production and disposition of screenshots of a page. Compiled to shoot.js by tsc
  (issue #73); edit this file, not the emitted one.
*/

// IMPORTS

// Shared configuration for timeout multiplier.
import {applyMultiplier} from './config';
import {nowStamp} from './dateTime';
import * as fs from 'fs/promises';
import * as path from 'path';
import type {Locator, Page, PageScreenshotOptions} from 'playwright';
import type {Report} from '../types';
// pngjs ships no bundled declarations, so its import stays a require, untyped (as in testaro/motion.ts).
const {PNG} = require('pngjs');

// TYPES

// The options of a screenshot.
export interface ShootOptions {
  // Playwright locator of a mask.
  exclusionSelector?: string | null;
  // Color fidelity: 0 (grayscale), 2 (RGB), 4 (grayscale alpha), 6 (RGBA).
  colorType?: number;
  // Disposition: return, report, file.
  action?: 'return' | 'report' | 'file';
  // Screenshot scale ('css' or 'device'); see screenShot below.
  scale?: 'css' | 'device';
}
/*
  The resolution of shoot is '' on failure. Otherwise, with the report action, it is the index of the image appended to report.images; with the return action, the base64 encoding of the screenshot; and with the file action, the name of the file it was saved in.
*/
interface Shoot {
  (page: Page, report: Report, options: ShootOptions & {action: 'report'}): Promise<number | ''>;
  (page: Page, report: Report, options?: ShootOptions): Promise<string>;
}

// FUNCTIONS

// Returns a probably unique file name.
const randomFileName = (suffixLength = 3) => {
  const fileName = `${nowStamp()}-${Math.random().toString(36).slice(2, 2 + suffixLength)}`;
  return fileName;
};
// Creates and returns a screenshot.
const screenShot = async (
  page: Page, exclusionLocator: Locator | null = null, scale: 'css' | 'device' = 'css'
): Promise<Buffer | ''> => {
  const options: PageScreenshotOptions = {
    fullPage: true,
    // 'css' renders 1 image pixel per CSS pixel; 'device' renders at the context's
    // deviceScaleFactor, i.e. an image whose pixel coordinates are the CSS
    // coordinates multiplied by that factor.
    scale,
    timeout: applyMultiplier(4000)
  };
  if (exclusionLocator) {
    options.mask = [exclusionLocator];
  }
  // Make and return a screenshot as a buffer.
  return await page.screenshot(options)
  .catch(error => {
    console.log(`ERROR: Screenshot failed (${error.message})`);
    return '' as const;
  });
};
// Creates and disposes of the PNG of a screenshot.
export const shoot = (async (page: Page, report: Report, {
  // Playwright locator of a mask.
  exclusionSelector = null,
  // Color fidelity: 0 (grayscale), 2 (RGB), 4 (grayscale alpha), 6 (RGBA).
  colorType = 0,
  // Disposition: return, report, file.
  action = 'return',
  // Screenshot scale ('css' or 'device'); see screenShot above.
  scale = 'css'
}: ShootOptions = {}) => {
  // Make and get a screenshot as a buffer.
  let shot: Buffer | '' | null = await screenShot(
    page, exclusionSelector ? page.locator(exclusionSelector) : null, scale
  );
  // If it succeeded:
  if (shot.length) {
    // Get the screenshot as an object representation of a PNG image.
    let png = PNG.sync.read(shot);
    shot = null;
    // Convert the PNG object to a buffer, applying the specified color type.
    const pngBuffer: Buffer = PNG.sync.write(png, {colorType});
    png = null;
    // Force garbage collection if available and if --expose-gc was a node option.
    if (global.gc) {
      global.gc();
    }
    // Convert the buffer to a base64 string.
    const base64 = pngBuffer.toString('base64');
    // If the string is to be returned:
    if (action === 'return') {
      // Return it.
      return base64;
    }
    // Otherwise, if it is to be appended to the report:
    if (action === 'report') {
      report.images ??= [];
      // Append it to the images array in the report.
      report.images.push(base64);
      // Return the index of the added image in the array.
      return report.images.length - 1;
    }
    // Otherwise, if it is to be saved in a file:
    if (action === 'file') {
      const fileName = randomFileName(4);
      const filePath = path.join(report.jobData!.tmpDir as string, fileName);
      // Save it in a file.
      await fs.writeFile(filePath, base64);
      // Return the file name.
      return fileName;
    }
    // Otherwise, i.e. if the action is invalid, return this.
    return '';
  }
  // Otherwise, i.e. if it failed:
  else {
    // Return this.
    return '';
  }
}) as Shoot;
