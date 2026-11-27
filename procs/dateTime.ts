/*
  © 2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  dateTime
  Processes dates and times. Compiled to dateTime.js by tsc (issue #73); edit this file, not the
  emitted one.
*/

// Inserts a character periodically in a string.
const punctuate = (string: string, insertion: string, chunkSize: number) => {
  const segments: string[] = [];
  let startIndex = 0;
  while (startIndex < string.length) {
    segments.push(string.slice(startIndex, startIndex + chunkSize));
    startIndex += chunkSize;
  }
  return segments.join(insertion);
};
// Gets the date of a timestamp.
export const dateOf = (timeStamp: string): Date | null => {
  if (/^\d{6}T\d{4}$/.test(timeStamp)) {
    const dateString = punctuate(timeStamp.slice(0, 6), '-', 2);
    const timeString = punctuate(timeStamp.slice(7, 11), ':', 2);
    return new Date(`20${dateString}T${timeString}Z`);
  }
  else {
    return null;
  }
};
// Returns a human-friendly representation of the current date and time.
export const nowString = () => (new Date()).toISOString().slice(2, 16);
// Returns a compact representation of the current date and time.
export const nowStamp = () => nowString().replace(/[:-]/g, '');
