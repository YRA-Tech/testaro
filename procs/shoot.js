"use strict";
/*
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.
  Licensed under the MIT License. See LICENSE file for details.
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
exports.shoot = void 0;
/*
  shoot
  Manages the production and disposition of screenshots of a page. Compiled to shoot.js by tsc
  (issue #73); edit this file, not the emitted one.
*/
// IMPORTS
// Shared configuration for timeout multiplier.
const config_1 = require("./config");
const dateTime_1 = require("./dateTime");
const fs = __importStar(require("fs/promises"));
const path = __importStar(require("path"));
// pngjs ships no bundled declarations, so its import stays a require, untyped (as in testaro/motion.ts).
const { PNG } = require('pngjs');
// FUNCTIONS
// Returns a probably unique file name.
const randomFileName = (suffixLength = 3) => {
    const fileName = `${(0, dateTime_1.nowStamp)()}-${Math.random().toString(36).slice(2, 2 + suffixLength)}`;
    return fileName;
};
// Creates and returns a screenshot.
const screenShot = async (page, exclusionLocator = null, scale = 'css') => {
    const options = {
        fullPage: true,
        // 'css' renders 1 image pixel per CSS pixel; 'device' renders at the context's
        // deviceScaleFactor, i.e. an image whose pixel coordinates are the CSS
        // coordinates multiplied by that factor.
        scale,
        timeout: (0, config_1.applyMultiplier)(4000)
    };
    if (exclusionLocator) {
        options.mask = [exclusionLocator];
    }
    // Make and return a screenshot as a buffer.
    return await page.screenshot(options)
        .catch(error => {
        console.log(`ERROR: Screenshot failed (${error.message})`);
        return '';
    });
};
// Creates and disposes of the PNG of a screenshot.
exports.shoot = (async (page, report, { 
// Playwright locator of a mask.
exclusionSelector = null, 
// Color fidelity: 0 (grayscale), 2 (RGB), 4 (grayscale alpha), 6 (RGBA).
colorType = 0, 
// Disposition: return, report, file.
action = 'return', 
// Screenshot scale ('css' or 'device'); see screenShot above.
scale = 'css' } = {}) => {
    // Make and get a screenshot as a buffer.
    let shot = await screenShot(page, exclusionSelector ? page.locator(exclusionSelector) : null, scale);
    // If it succeeded:
    if (shot.length) {
        // Get the screenshot as an object representation of a PNG image.
        let png = PNG.sync.read(shot);
        shot = null;
        // Convert the PNG object to a buffer, applying the specified color type.
        const pngBuffer = PNG.sync.write(png, { colorType });
        png = null;
        // Force garbage collection if available and if --expose-gc was a node option.
        if (global.gc) {
            global.gc();
        }
        // Convert the buffer to a base64 string.
        const base64 = pngBuffer.toString('base64');
        // If the string is to be returned:
        if (action === 'return') {
            // Return it.
            return base64;
        }
        // Otherwise, if it is to be appended to the report:
        if (action === 'report') {
            report.images ??= [];
            // Append it to the images array in the report.
            report.images.push(base64);
            // Return the index of the added image in the array.
            return report.images.length - 1;
        }
        // Otherwise, if it is to be saved in a file:
        if (action === 'file') {
            const fileName = randomFileName(4);
            const filePath = path.join(report.jobData.tmpDir, fileName);
            // Save it in a file.
            await fs.writeFile(filePath, base64);
            // Return the file name.
            return fileName;
        }
        // Otherwise, i.e. if the action is invalid, return this.
        return '';
    }
    // Otherwise, i.e. if it failed:
    else {
        // Return this.
        return '';
    }
});
