"use strict";
/*
  © 2023–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSource = void 0;
/*
  getSource
  Gets and returns the source of a document. Compiled to getSource.js by tsc (issue #73); edit
  this file, not the emitted one.
*/
// IMPORTS
// Module to process files.
const fs = __importStar(require("fs/promises"));
// FUNCTIONS
// Gets and returns the source of a page.
const getSource = async (page) => {
    const url = page.url();
    const scheme = url.replace(/:.+/, '');
    // Initialize the test data.
    const data = {
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
            const rawPage = await response.text();
            data.source = rawPage;
        }
        catch (error) {
            console.log(`ERROR (${error.message}) getting source of ${url}; cause: ${error.cause}`);
            data.prevented = true;
            data.error = `ERROR getting source of ${url}`;
        }
    }
    return data;
};
exports.getSource = getSource;
