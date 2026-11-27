"use strict";
/*
  © 2024–2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

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
// FUNCTIONS
// Sends a message to the parent process.
const sendMessage = (message) => {
    try {
        if (typeof process.send === 'function') {
            process.send(message);
        }
    }
    catch (error) {
        console.log(`ERROR: process.send threw ${error.message} trying to send message ${JSON.stringify(message)} to parent`);
    }
};
// ERROR LOGGING
// Log an uncaught exception, tell the parent, and exit.
process.on('uncaughtException', error => {
    console.error(`ERROR:\n${error.stack || 'Uncaught exception'}`);
    sendMessage({
        status: 'error',
        error: 'uncaughtException'
    });
    process.exit(1);
});
// Log an unhandled rejection, tell the parent, and exit.
process.on('unhandledRejection', reason => {
    console.error(`ERROR:\n${reason?.stack || 'Unhandled rejection'}`);
    sendMessage({
        status: 'error',
        error: 'unhandledRejection'
    });
    process.exit(1);
});
// IMPORTS
// Module to perform file operations.
const fs = __importStar(require("fs/promises"));
// Function to perform a test act.
const testAct_1 = require("./testAct");
// FUNCTIONS
// Performs tests of a test act.
const doTestAct = async (reportPath, actIndex) => {
    // Get the temporary report.
    const reportJSON = await fs.readFile(reportPath, 'utf8');
    const report = JSON.parse(reportJSON);
    const act = report.acts[actIndex];
    let status = 'ok';
    let error = '';
    try {
        // Perform the act, revising the report.
        const { noPage } = await (0, testAct_1.performTestAct)({ report, actIndex });
        // If the launch aborted the job or no page existed, report that. (The reason is in the act's data.error.)
        if (report.jobData?.aborted) {
            status = 'error';
            error = 'Page launch aborted';
        }
        else if (noPage) {
            status = 'error';
            error = 'ERROR: No page';
        }
    }
    // If the tool invocation failed:
    catch (err) {
        console.log(`ERROR: Test act ${act.which} failed (${err.message.slice(0, 400)})`);
        status = 'error';
        error = 'ERROR performing the act';
    }
    // Save the revised report and report the outcome to the parent.
    await fs.writeFile(reportPath, JSON.stringify(report));
    sendMessage(status === 'ok' ? { status } : { status, error });
    process.exit(status === 'ok' ? 0 : 1);
};
const args = process.argv;
// Perform the specified test act.
doTestAct(args[2], Number.parseInt(args[3]));
