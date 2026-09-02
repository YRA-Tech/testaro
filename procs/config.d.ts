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
// Whether an environment variable is set to a true value, or the default if unset.
export function envFlag(name: string, defaultValue?: boolean): boolean;
// Load states a navigation can wait for, from strictest to loosest.
export const waitStates: string[];
// Navigation options of a job (its navigation property over the environment defaults).
export function getNavigation(report: unknown): {
  waitUntil: 'networkidle' | 'load' | 'domcontentloaded';
  timeout: number;
  failFast4xx: boolean;
};
// The scanner identity header value of a job, or '' for none.
export function getScannerId(report: unknown): string;
// Whether a job scrolls the full page after navigation.
export function getScroll(report: unknown): boolean;
// Launch retries per rule of the testaro tool.
export const ruleLaunchRetries: number;
// Defaults for the qualWeb tool's browser.
export const qualWebDefaults: {stealth: boolean; adBlock: boolean};
