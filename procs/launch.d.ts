/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  launch (hand-written declarations)
  Minimal typings for the surface of procs/launch.js that converted TypeScript
  files use. Delete this file when launch.js itself is converted (issue #73).
*/

import type {Page, Request, Response} from 'playwright';
import type {BrowserID, Report} from '../types';

export interface LaunchOptions {
  report?: Report;
  actIndex?: number | null;
  tempBrowserID?: BrowserID | '';
  tempURL?: string;
  headEmulation?: string;
  xPathNeed?: string;
  needsAccessibleName?: boolean;
  retries?: number;
  contextOverrides?: Record<string, unknown>;
}

// Launches a browser, navigates to a target, and returns the page, or undefined on failure.
export function launch(opts?: LaunchOptions): Promise<Page | undefined>;
// Closes the browser of a page, with its context.
export function browserClose(page: Page | null | undefined): Promise<void>;
// Navigates a page to a URL.
export function goTo(
  report: Report, page: Page, url: string, timeout: number, waitUntil: string
): Promise<unknown>;
// A stylesheet request of the main frame of a page and its response, or null if the request failed.
export interface SheetRecord {
  request: Request;
  response: Response | null;
  // Whether the request was made while a navigation to the current document was pending.
  provisional?: boolean;
}
// Starts keeping stylesheet records of the current document of the main frame of a page.
export function trackSheets(page: Page): void;
// Gets the stylesheet records of a page, by request URL, or null if none are kept for it.
export function getSheetRecords(page: Page): Map<string, SheetRecord> | null;
// Gets the nonce, if any, of a response.
export function getNonce(response: Response): Promise<string>;
