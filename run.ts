/*
  © 2021–2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  run
  Testaro main utility module. Compiled to run.js by tsc (issue #73); edit this file, not the emitted one. The .env file is loaded by a statement before the imports, which tsc's CommonJS emit keeps in order, so it is loaded before any other module, as it was.
*/

// IMPORTS

// Load the .env file before any Testaro module. The procs modules read their environment variables once, when they are first required, so a module required earlier would miss the values in .env.
(require('dotenv') as typeof import('dotenv')).config({quiet: true});
import {doActs} from './procs/doActs';
import type {DoActsOptions} from './procs/doActs';
import {getIsolation, isValidJob} from './procs/job';
import {getCatalog} from './procs/catalog';
import {nowString} from './procs/dateTime';
import {chromium} from 'playwright-extra';
const fs = (require('fs') as typeof import('fs')).promises;
import * as os from 'os';
/*
  Module to evade detection of Chromium automation. Injects launch flags
  (e.g., `--disable-blink-features=AutomationControlled`) and patches
  Blink-only DOM globals. Job-level opt-out for Chromium happens in
  procs/launch.js via the `stealth` field.
*/
import StealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(StealthPlugin());
import type {ProgressEvent, Report, ToolID} from './types';

// TYPES

// The options of doJob.
export interface DoJobOptions extends DoActsOptions {
  // A callback for progress events, whose exceptions are logged and ignored (#44).
  onProgress?: (event: ProgressEvent) => void;
}

// FUNCTIONS

// Returns whether a value is a primitive that, in sloppy mode, silently ignores an assignment to a property, where strict mode throws (issue #73, hazard 7). null and undefined throw in both.
const ignoresAssignment = (value: unknown): boolean => ['string', 'number', 'boolean'].includes(typeof value);
/*
  Returns an operating-system-compatible absolute path to a temporary directory.
  Kept as it is (issue #73; see #231): the path is made from the job ID, which may contain "../", and if the directory cannot be created the path falls back to the system's temporary directory. doJob deletes the directory recursively at the end of the job either way.
*/
const getTmpDirPath = async (jobName: string): Promise<string | null> => {
  let jobTmpDir: string | null = `${__dirname}/tmp/${jobName}`;
  try {
    // Ensure that a temporary directory exists.
    await fs.mkdir(jobTmpDir, {recursive: true});
  }
  catch (error) {
    console.log(`ERROR: Could not create temporary directory (${(error as Error).message})`);
    jobTmpDir = null;
  }
  const tmpDirs = [os.tmpdir(), '/tmp'];
  if (jobTmpDir) {
    tmpDirs.unshift(jobTmpDir);
  }
  let tmpDir: string | null = null;
  // For each potential temporary directory:
  for (const tmpDirAlternative of tmpDirs) {
    try {
      // Verify that it is writable.
      await fs.access(tmpDirAlternative, fs.constants.W_OK);
      tmpDir = tmpDirAlternative;
      // If it is, stop checking alternatives.
      break;
    }
    // If it is not:
    catch(error) {
      // Report this and continue checking alternatives.
      console.log(`ERROR: ${tmpDirAlternative} not writable for temporary files`);
    }
  }
  // If no writable temporary directory was found:
  if (! tmpDir) {
    // Report this.
    console.log('ERROR: No writable temporary directory was found');
  }
  // Return the directory path or a failure.
  return tmpDir;
};
// Runs a job and returns a report.
export const doJob = async (job: Report, opts: DoJobOptions = {}): Promise<Report> => {
  // Fire-and-forget progress emitter (see #44). A handler exception is logged,
  // never propagated, so a faulty consumer can never abort the job. Payloads
  // carry identifiers and timing only — no report content — and are delivered
  // via the existing opts param, so doJob's signature is unchanged.
  const emitProgress = (event: ProgressEvent) => {
    if (opts && typeof opts.onProgress === 'function') {
      try {
        opts.onProgress(event);
      }
      catch (error) {
        console.log(`ERROR in onProgress callback: ${(error as Error).message}`);
      }
    }
  };
  // Initialize a report as a copy of the job.
  let report: Report = JSON.parse(JSON.stringify(job));
  // A job that is a string, number or boolean cannot hold job data (see ignoresAssignment).
  if (! ignoresAssignment(report)) {
    report.jobData ??= {};
  }
  const {jobData} = report;
  // Get whether the job is valid and, if not, why not.
  const jobInvalidity = isValidJob(job);
  // If it is invalid:
  if (! jobInvalidity.isValid) {
    // Report this.
    console.log(`ERROR: ${jobInvalidity.error}`);
    // Job data that is not an object makes the job invalid, so here it may be a primitive (see ignoresAssignment). Kept as it is (issue #73; see #231): such a report records no abort.
    if (! ignoresAssignment(jobData)) {
      jobData!.aborted = true;
      jobData!.abortedAct = null;
      jobData!.abortMessage = jobInvalidity.error;
    }
  }
  // Otherwise, i.e. if it is valid:
  else {
    // Report this.
    console.log(`Starting job ${job.id} (${job.target!.what})`);
    emitProgress({event: 'jobStart', id: job.id});
    const tmpDir = await getTmpDirPath(job.id);
    // Add initialized job data to the report.
    const startTime = new Date();
    report.jobData = {
      tmpDir,
      startTime: nowString(),
      endTime: '',
      elapsedSeconds: 0,
      visitLatency: 0,
      logCount: 0,
      logSize: 0,
      errorLogCount: 0,
      errorLogSize: 0,
      prohibitedCount: 0,
      visitRejectionCount: 0,
      aborted: false,
      abortedAct: null,
      abortTime: '',
      abortMessage: '',
      presses: 0,
      amountRead: 0,
      toolTimes: {},
      preventions: {},
      isolation: getIsolation(job)
    };
    // Kept as it is (issue #73; see #231): this adds a listener for every job the process runs.
    process.on('message', message => {
      if (message === 'interrupt') {
        console.log('ERROR: Terminal interrupted the job');
        process.exit();
      }
    });
    // If the job specifies a browser ID and a target and requires standardization:
    if (job.browserID && job.target && job.standard !== 'no') {
      // Initialize a catalog so it precedes any page images in the report.
      report.catalog = {};
      // getCatalog() navigates to the target (procs/catalog.js) — which, on a
      // slow, blocked, or dead target, can retry across browser types — before
      // any act runs. Bracket it with events so a consumer can heartbeat through
      // this phase instead of seeing the job fall silent until the first act.
      emitProgress({event: 'catalogStart'});
      const catalogStartMs = Date.now();
      // Add a catalog of the target, and a page image if required, to the report.
      report.catalog = await getCatalog(report);
      emitProgress({event: 'catalogEnd', elapsedMs: Date.now() - catalogStartMs});
    }
    // Perform the acts and revise the report.
    report = await doActs(report, opts);
    // Delete the temporary directory. (A null directory has already made doActs throw.)
    await fs.rm(tmpDir!, {recursive: true, force: true});
    // Add the end time and duration to the report.
    const endTime = new Date();
    report.jobData!.endTime = nowString();
    // (Dates subtract as their time values.)
    const elapsedSeconds = Math.floor(
      ((endTime as unknown as number) - (startTime as unknown as number)) / 1000
    );
    report.jobData!.elapsedSeconds =  elapsedSeconds;
    console.log(`Elapsed seconds: ${elapsedSeconds}`);
    // Consolidate and sort the tool times, if any.
    const {toolTimes} = report.jobData! as {toolTimes: Record<string, number>};
    const toolTimeData = Object
    .keys(toolTimes)
    .sort((a, b) => toolTimes[b] - toolTimes[a])
    .map(tool => [tool, toolTimes[tool]] as const);
    report.jobData!.toolTimes = {};
    toolTimeData.forEach(item => {
      report.jobData!.toolTimes![item[0] as ToolID] = item[1];
    });
  }
  // Signal job completion (also fires for an invalid job, after its abort data
  // is set) so a consumer can finalize regardless of outcome.
  emitProgress({event: 'jobEnd', id: job.id, aborted: !! report.jobData!.aborted});
  // Return the report.
  return report;
};
