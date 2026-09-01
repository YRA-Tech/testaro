/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  shoot (hand-written declarations)
  Minimal typings for the surface of procs/shoot.js that converted TypeScript
  files use. Delete this file when shoot.js itself is converted (issue #73).
*/

import type {Page} from 'playwright';
import type {Report} from '../types';

export interface ShootOptions {
  exclusionSelector?: string | null;
  // Color fidelity: 0 (grayscale), 2 (RGB), 4 (grayscale alpha), 6 (RGBA).
  colorType?: number;
  // Disposition: return, report, file.
  action?: 'return' | 'report' | 'file';
  // Screenshot scale.
  scale?: 'css' | 'device';
}

// Makes a screenshot of a page and returns, reports, or files it. With the return action,
// the resolution is the base64 encoding of the screenshot, or a falsy value on failure.
export function shoot(
  page: Page, report: Report, options?: ShootOptions
): Promise<string | null | undefined>;
