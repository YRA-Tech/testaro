/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Page} from 'playwright';
import type {Report, ToolID} from '../types';

/*
  registry
  Maps each tool ID to a lazy loader of its adapter module, so that an adapter still loads only
  when a test act uses it, while the tool IDs form a checked union and every adapter is checked
  against one reporter signature (issue #73, hazard 6 of docs/typescript-phase-4-plan.md).
  Compiled to registry.js by tsc; edit this file, not the emitted one. Adding a tool means
  adding it to ToolID in types.ts, to the tools map in procs/job.js, and here; the compiler
  reports a ToolID without a loader.
*/

// TYPES

// What a tool adapter's reporter resolves with: the act's data and result, each shaped by its
// tool. testAct reads only data.prevented, data.error, data.scope and result.standardResult.
export interface ToolReport {
  data?: object;
  result?: object;
}
// The module shape of a tool adapter. The page is undefined only for the testaro tool, which
// launches its own pages per rule; only qualWeb uses the time limit.
export interface ToolModule {
  reporter(
    page: Page, report: Report, actIndex: number, timeLimit: number
  ): Promise<ToolReport>;
}

// CONSTANTS

// The lazy loader of each tool's adapter.
export const toolLoaders = {
  alfa: () => require('./alfa') as typeof import('./alfa'),
  aslint: () => require('./aslint') as typeof import('./aslint'),
  axe: () => require('./axe') as typeof import('./axe'),
  ed11y: () => require('./ed11y') as typeof import('./ed11y'),
  htmlcs: () => require('./htmlcs') as typeof import('./htmlcs'),
  ibm: () => require('./ibm') as typeof import('./ibm'),
  nuVal: () => require('./nuVal') as typeof import('./nuVal'),
  nuVnu: () => require('./nuVnu') as typeof import('./nuVnu'),
  pour: () => require('./pour') as typeof import('./pour'),
  qualWeb: () => require('./qualWeb') as typeof import('./qualWeb'),
  surea11y: () => require('./surea11y') as typeof import('./surea11y'),
  testaro: () => require('./testaro') as typeof import('./testaro'),
  wave: () => require('./wave') as typeof import('./wave')
} satisfies Record<ToolID, () => ToolModule>;
