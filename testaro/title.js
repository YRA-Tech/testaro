"use strict";
/*
  © 2022–2023 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or   https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.reporter = void 0;
/*
  title
  This test reports the page title. Compiled to title.js by tsc (issue #73); edit this file,
  not the emitted one.
*/
// Runs the test and returns the result.
const reporter = async (page) => {
    const title = await page.title();
    return {
        data: {
            success: true,
            title
        },
        totals: [],
        standardInstances: []
    };
};
exports.reporter = reporter;
