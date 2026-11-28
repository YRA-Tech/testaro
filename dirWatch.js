"use strict";
/*
  © 2023–2024 CVS Health and/or one of its affiliates. All rights reserved.
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
exports.dirWatch = void 0;
/*
  dirWatch
  Module for watching a directory for jobs. Compiled to dirWatch.js by tsc (issue #73); edit this file, not the emitted one.
*/
// ########## IMPORTS
// Module to keep secrets.
require('dotenv').config();
// Module to read and write files.
const fs = __importStar(require("fs/promises"));
// Module to perform jobs.
const run_1 = require("./run");
// Module to get dates from time stamps.
const dateTime_1 = require("./procs/dateTime");
// Function to check that a job ID can name a file.
const job_1 = require("./procs/job");
// ########## CONSTANTS
const jobDir = process.env.JOBDIR;
const reportDir = process.env.REPORTDIR;
// ########## FUNCTIONS
// Writes a directory report and returns whether it was saved. A report is saved under its job ID, so it is not saved if that ID could name a file outside the report directory (an invalid job's report can have such an ID).
const writeDirReport = async (report) => {
    const jobID = report && report.id;
    if (jobID && !(0, job_1.isSafeJobID)(jobID)) {
        console.log(`ERROR: Job ID ${JSON.stringify(jobID)} cannot name a file, so the report was not saved`);
        return false;
    }
    if (jobID) {
        const rawDir = `${reportDir}/raw`;
        try {
            const reportJSON = JSON.stringify(report, null, 2);
            const reportName = `${jobID}.json`;
            await fs.mkdir(rawDir, { recursive: true });
            await fs.writeFile(`${rawDir}/${reportName}`, `${reportJSON}\n`);
            console.log(`Report ${jobID} saved in ${rawDir}`);
            return true;
        }
        catch (error) {
            console.log(`ERROR: Failed to save report ${jobID} in ${rawDir} (${error.message})`);
            return false;
        }
    }
    else {
        console.log('ERROR: Job has no ID');
        return false;
    }
};
// Archives a job.
const archiveJob = async (job, todoFileName) => {
    // Save the job in the done subdirectory.
    const { id } = job;
    const jobJSON = JSON.stringify(job, null, 2);
    const doneDir = `${jobDir}/done`;
    await fs.mkdir(doneDir, { recursive: true });
    await fs.writeFile(`${doneDir}/${id}.json`, `${jobJSON}\n`);
    // If the job had been saved as a file in the todo subdirectory:
    if (todoFileName) {
        // Delete the file.
        await fs.rm(`${jobDir}/todo/${todoFileName}`);
    }
    console.log(`Job ${id} from ${todoFileName} archived in ${doneDir} (${(0, dateTime_1.nowString)()})`);
};
// Moves a job that was not completed from the todo subdirectory to the failed subdirectory, so that it is not run again (#231). If this fails, it throws, and the watch stops.
const setAsideJob = async (todoFileName) => {
    const failedDir = `${jobDir}/failed`;
    await fs.mkdir(failedDir, { recursive: true });
    await fs.rename(`${jobDir}/todo/${todoFileName}`, `${failedDir}/${todoFileName}`);
    console.log(`Job file ${todoFileName} moved to ${failedDir} (${(0, dateTime_1.nowString)()})`);
};
// Waits.
const wait = (ms) => {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve('');
        }, ms);
    });
};
/*
  Checks for a directory job and, when found, performs and reports it.
  Arguments:
  0. Whether to continue watching after a job is run.
  1: interval in seconds from a no-job check to the next check.
*/
const dirWatch = async (isForever, intervalInSeconds) => {
    intervalInSeconds ||= 5;
    intervalInSeconds = Math.max(intervalInSeconds, 5);
    console.log(`Starting to watch directory ${jobDir}/todo for jobs`);
    let notYetRun = true;
    // As long as watching as to continue:
    while (isForever || notYetRun) {
        try {
            // If there are any jobs in the watched directory:
            const toDoFileNames = await fs.readdir(`${jobDir}/todo`);
            const jobFileNames = toDoFileNames.filter(fileName => fileName.endsWith('.json'));
            if (jobFileNames.length) {
                const jobFileName = jobFileNames[0];
                // If the first one is ready to do:
                const firstJobTimeStamp = jobFileName.replace(/-.+$/, '');
                // (A Date compares as its time value, and null, for a name without a time stamp, as 0.)
                if (Date.now() > (0, dateTime_1.dateOf)(firstJobTimeStamp)) {
                    // Get it.
                    const jobJSON = await fs.readFile(`${jobDir}/todo/${jobFileName}`, 'utf8');
                    let isCompleted = false;
                    try {
                        const job = JSON.parse(jobJSON);
                        let report = JSON.parse(jobJSON);
                        const { id } = job;
                        console.log(`\n\nDirectory job ${id} ready to do (${(0, dateTime_1.nowString)()})`);
                        // Perform it and get a report.
                        report = await (0, run_1.doJob)(report);
                        console.log(`Job ${id} finished (${(0, dateTime_1.nowString)()})`);
                        // Save the report and, if it was saved, archive the job.
                        if (await writeDirReport(report)) {
                            await archiveJob(job, jobFileName);
                            isCompleted = true;
                        }
                    }
                    catch (error) {
                        console.log(`ERROR processing directory job (${error.message})`);
                    }
                    // If the job was not completed (it is not JSON, it failed, or its report was not saved), move it aside, so that it is not run again.
                    if (!isCompleted) {
                        await setAsideJob(jobFileName);
                    }
                    notYetRun = false;
                }
                // Otherwise, i.e. if the first one is not yet ready to do:
                else {
                    // Report this.
                    console.log(`All jobs in ${jobDir} not yet ready to do (${(0, dateTime_1.nowString)()})`);
                    // Wait for the specified interval.
                    await wait(1000 * intervalInSeconds);
                }
            }
            // Otherwise, i.e. if there are no jobs in the watched directory:
            else {
                console.log(`No job in ${jobDir} (${(0, dateTime_1.nowString)()})`);
                // Wait for the specified interval.
                await wait(1000 * intervalInSeconds);
            }
        }
        // If a fatal error was thrown:
        catch (error) {
            // Report this.
            console.log(`ERROR: Directory watching failed (${error.message}); watching aborted`);
            // Quit watching.
            break;
        }
    }
};
exports.dirWatch = dirWatch;
