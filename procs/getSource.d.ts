/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  getSource (hand-written declarations)
  Minimal typings for the surface of procs/getSource.js that converted
  TypeScript files use. Delete this file when getSource.js itself is converted
  (issue #73).
*/

import type {Page} from 'playwright';

export interface SourceData {
  prevented: boolean;
  source: string;
  error?: string;
}

// Gets the source of the document of a page.
export function getSource(page: Page): Promise<SourceData>;
