"use strict";
/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.toolLoaders = void 0;
// CONSTANTS
// The lazy loader of each tool's adapter.
exports.toolLoaders = {
    alfa: () => require('./alfa'),
    aslint: () => require('./aslint'),
    axe: () => require('./axe'),
    ed11y: () => require('./ed11y'),
    htmlcs: () => require('./htmlcs'),
    ibm: () => require('./ibm'),
    nuVal: () => require('./nuVal'),
    nuVnu: () => require('./nuVnu'),
    pour: () => require('./pour'),
    qualWeb: () => require('./qualWeb'),
    surea11y: () => require('./surea11y'),
    testaro: () => require('./testaro'),
    wave: () => require('./wave')
};
