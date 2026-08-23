/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  config (hand-written declarations)
  Minimal typings for the surface of procs/config.js that converted TypeScript
  files use. Delete this file when config.js itself is converted (issue #73).
*/

// Multiplies a base timeout by the configured timeout multiplier.
export function applyMultiplier(baseTimeout: number): number;
