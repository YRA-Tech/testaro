/*
  © 2023–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  getSource
  Gets and returns the source of a document. Compiled to getSource.js by tsc (issue #73); edit
  this file, not the emitted one.
*/

// IMPORTS

// Module to process files.
import * as fs from 'fs/promises';
import type {Page} from 'playwright';

// TYPES

// The source of a document, or why it was not obtained.
export interface SourceData {
  prevented: boolean;
  source: string;
  error?: string;
}

// FUNCTIONS

// Gets and returns the source of a page.
export const getSource = async (page: Page): Promise<SourceData> => {
  const url = page.url();
  const scheme = url.replace(/:.+/, '');
  // Initialize the test data.
  const data: SourceData = {
    prevented: false,
    source: ''
  };
  // If the page is a local file:
  if (scheme === 'file') {
    const filePath = url.slice(7);
    // Get the source from it.
    const rawPage = await fs.readFile(filePath, 'utf8');
    // Add the source to the test data.
    data.source = rawPage;
  }
  // Otherwise, i.e. if the page is not a local file:
  else {
    try {
      const response = await page.goto(url);
      // A null response throws here, as it did before the conversion, and is reported below.
      const rawPage = await response!.text();
      data.source = rawPage;
    }
    catch(error) {
      console.log(`ERROR (${(error as Error).message}) getting source of ${url}; cause: ${(error as Error).cause}`);
      data.prevented = true;
      data.error = `ERROR getting source of ${url}`;
    }
  }
  return data;
};
