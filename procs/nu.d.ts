/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  nu (hand-written declarations)
  Minimal typings for the surface of procs/nu.js that converted TypeScript
  files use. Delete this file when nu.js itself is converted (issue #73).
*/

import type {Page} from 'playwright';

// The content obtained for a nuVal or nuVnu test.
export interface NuContent {
  withSource: boolean | undefined;
  testTarget: string | null;
  prevented?: boolean;
  error?: string;
}
// One message of a curated Nu Html Checker result.
export interface NuMessage {
  type: string;
  subType?: string;
  message: string;
  extract?: string;
  [key: string]: unknown;
}
// A curated Nu Html Checker result; curate guarantees the messages array.
export interface NuResult {
  messages: NuMessage[];
  [key: string]: unknown;
}

// Gets the content for a nuVal or nuVnu test.
export function getContent(page: Page, withSource: boolean | undefined): Promise<NuContent>;
// Postprocesses a result from nuVal or nuVnu tests; undefined when nuData is falsy.
export function curate(
  data: {prevented?: boolean; error?: string},
  nuData: unknown,
  rules: string[] | undefined
): Promise<NuResult | undefined>;
// Gets an excerpt of a message extract, or null if the catalog reports the element.
export function getExtractExcerpt(extract: string | null | undefined): string | null;
