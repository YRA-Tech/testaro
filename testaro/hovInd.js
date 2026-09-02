"use strict";
/*
  © 2023–2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or  https://opensource.org/license/mit/ for details.

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
exports.reporter = void 0;
const playwright = __importStar(require("playwright"));
const testaro_1 = require("../procs/testaro");
const config_1 = require("../procs/config");
// CONSTANTS
// Standard non-default hover cursors of inputs, by type.
const standardInputCursors = {
    email: 'text',
    image: 'pointer',
    number: 'text',
    password: 'text',
    search: 'text',
    tel: 'text',
    text: 'text',
    url: 'text'
};
// Style properties compared between states.
const comparedStyles = ['backgroundColor', 'border', 'color', 'outline'];
// Maximum count of triggers inspected, because each inspection performs 3 browser interactions.
const MAX_TRIGGERS = 60;
// FUNCTIONS
// Returns the hover-related style properties of a trigger in its current state.
const getStyles = async (loc) => await loc.evaluate(element => {
    const { cursor, borderColor, borderStyle, borderWidth, outlineColor, outlineStyle, outlineWidth, outlineOffset, color, backgroundColor } = window.getComputedStyle(element);
    return {
        tagName: element.tagName,
        inputType: element.tagName === 'INPUT' ? element.getAttribute('type') || 'text' : null,
        // Ignore any custom cursor images and keep only the fallback keyword.
        cursor: cursor.replace(/^.+, */, ''),
        border: `${borderColor} ${borderStyle} ${borderWidth}`,
        outline: `${outlineColor} ${outlineStyle} ${outlineWidth} ${outlineOffset}`,
        color,
        backgroundColor
    };
});
// Returns whether the hover cursor of a trigger is standard. A computed value of auto is standard, because browsers render it as the type-appropriate cursor.
const cursorIsStandard = (styles) => {
    const { tagName, inputType, cursor } = styles;
    if (tagName === 'A') {
        return ['pointer', 'auto'].includes(cursor);
    }
    if (tagName === 'INPUT') {
        return [standardInputCursors[inputType || 'text'], 'default', 'auto'].includes(cursor);
    }
    if (tagName === 'BUTTON') {
        return ['default', 'auto'].includes(cursor);
    }
    // Any other trigger is one with a hover listener, and its cursor is assumed standard.
    return true;
};
// Returns whether the compared styles of two states are identical.
const areAlike = (styles0, styles1) => comparedStyles
    .every(style => styles0[style] === styles1[style]);
// Runs the test and returns the result.
const reporter = async (page, report, _, withItems) => {
    // Get locators for the visible triggers.
    const selector = ['a', 'button', 'input', '[onmouseenter]', '[onmouseover]']
        .map(tagSelector => `body ${tagSelector}:visible`)
        .join(', ');
    const allLocs = await page.locator(selector).all();
    // Inspect at most MAX_TRIGGERS of them, evenly spaced through the page.
    const step = Math.max(1, Math.ceil(allLocs.length / MAX_TRIGGERS));
    const locs = allLocs.filter((loc, index) => index % step === 0).slice(0, MAX_TRIGGERS);
    const data = {
        triggerCount: allLocs.length,
        inspectedCount: locs.length
    };
    // Initialize the violations, by severity.
    const cursorViolations = [];
    const styleViolations = [];
    const timeout = (0, config_1.applyMultiplier)(500);
    // For each trigger:
    for (const loc of locs) {
        try {
            // Move the mouse away from any previously hovered trigger.
            await page.mouse.move(0, 0);
            // Get its styles when neither focused nor hovered over.
            const neutralStyles = await getStyles(loc);
            // Get its styles when only focused.
            await loc.focus({ timeout });
            const focusStyles = await getStyles(loc);
            await loc.blur({ timeout });
            // Get its styles when only hovered over.
            await loc.hover({ timeout });
            const hoverStyles = await getStyles(loc);
            await page.mouse.move(0, 0);
            // If its hover cursor is nonstandard:
            if (!cursorIsStandard(hoverStyles)) {
                // Add a violation.
                cursorViolations.push({
                    loc,
                    what: `Element has a nonstandard hover cursor (${hoverStyles.cursor})`
                });
            }
            // If it is a button and its hover styles are indistinguishable from its neutral styles:
            if (hoverStyles.tagName === 'BUTTON' && areAlike(neutralStyles, hoverStyles)) {
                // Add a violation.
                styleViolations.push({
                    loc,
                    what: 'Element border, outline, color, and background color do not change when hovered over'
                });
            }
            // Otherwise, if its hover styles differ from its neutral styles but are indistinguishable from its focus styles:
            else if (!areAlike(neutralStyles, hoverStyles) && areAlike(focusStyles, hoverStyles)) {
                // Add a violation.
                styleViolations.push({
                    loc,
                    what: 'Element border, outline, color, and background color are alike on hover and focus'
                });
            }
        }
        // If focusing, blurring, or hovering throws an error:
        catch (error) {
            // If the error is a timeout, skip the trigger.
            if (error instanceof playwright.errors.TimeoutError) {
                continue;
            }
            // Otherwise, report this and quit.
            data.prevented = true;
            data.error = `ERROR inspecting a trigger (${error.message.slice(0, 200)})`;
            break;
        }
    }
    // Get results for the two severities and merge them.
    const cursorResult = await (0, testaro_1.getBasicResult)(report, withItems, 'hovInd', 2, 'Elements have nonstandard hover cursors', data, cursorViolations);
    const styleResult = await (0, testaro_1.getBasicResult)(report, withItems, 'hovInd', 1, 'Element styles do not distinguish hovering from the neutral or focus state', data, styleViolations);
    const totals = cursorResult.totals.map((total, index) => total + styleResult.totals[index]);
    return {
        data,
        totals,
        standardInstances: [...cursorResult.standardInstances, ...styleResult.standardInstances]
    };
};
exports.reporter = reporter;
