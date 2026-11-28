/*
  © 2023–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  dirWatch
  Module for watching a directory for jobs. Compiled to dirWatch.js by tsc (issue #73); edit this file, not the emitted one.
*/

// ########## IMPORTS

// Module to keep secrets.
(require('dotenv') as typeof import('dotenv')).config();
// Module to read and write files.
import * as fs from 'fs/promises';
// Module to perform jobs.
import {doJob} from './run';
// Module to get dates from time stamps.
import {dateOf, nowString} from './procs/dateTime';
import type {Report} from './types';

// ########## CONSTANTS

const jobDir = process.env.JOBDIR;
const reportDir = process.env.REPORTDIR;

// ########## FUNCTIONS

// Writes a directory report and returns whether it was saved.
const writeDirReport = async (report: Report): Promise<boolean> => {
  const jobID = report && report.id;
  if (jobID) {
    const rawDir = `${reportDir}/raw`;
    try {
      const reportJSON = JSON.stringify(report, null, 2);
      const reportName = `${jobID}.json`;
      await fs.mkdir(rawDir, {recursive: true});
      await fs.writeFile(`${rawDir}/${reportName}`, `${reportJSON}\n`);
      console.log(`Report ${jobID} saved in ${rawDir}`);
      return true;
    }
    catch(error) {
      console.log(`ERROR: Failed to save report ${jobID} in ${rawDir} (${(error as Error).message})`);
      return false;
    }
  }
  else {
    console.log('ERROR: Job has no ID');
    return false;
  }
};
// Archives a job.
const archiveJob = async (job: Report, todoFileName: string) => {
  // Save the job in the done subdirectory.
  const {id} = job;
  const jobJSON = JSON.stringify(job, null, 2);
  const doneDir = `${jobDir}/done`;
  await fs.mkdir(doneDir, {recursive: true});
  await fs.writeFile(`${doneDir}/${id}.json`, `${jobJSON}\n`);
  // If the job had been saved as a file in the todo subdirectory:
  if (todoFileName) {
    // Delete the file.
    await fs.rm(`${jobDir}/todo/${todoFileName}`);
  }
  console.log(`Job ${id} from ${todoFileName} archived in ${doneDir} (${nowString()})`);
};
// Moves a job that was not completed from the todo subdirectory to the failed subdirectory, so that it is not run again (#231). If this fails, it throws, and the watch stops.
const setAsideJob = async (todoFileName: string) => {
  const failedDir = `${jobDir}/failed`;
  await fs.mkdir(failedDir, {recursive: true});
  await fs.rename(`${jobDir}/todo/${todoFileName}`, `${failedDir}/${todoFileName}`);
  console.log(`Job file ${todoFileName} moved to ${failedDir} (${nowString()})`);
};
// Waits.
const wait = (ms: number) => {
  return new Promise<string>(resolve => {
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
export const dirWatch = async (isForever: boolean, intervalInSeconds: number): Promise<void> => {
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
        if (Date.now() > (dateOf(firstJobTimeStamp) as unknown as number)) {
          // Get it.
          const jobJSON = await fs.readFile(`${jobDir}/todo/${jobFileName}`, 'utf8');
          let isCompleted = false;
          try {
            const job: Report = JSON.parse(jobJSON);
            let report: Report = JSON.parse(jobJSON);
            const {id} = job;
            console.log(`\n\nDirectory job ${id} ready to do (${nowString()})`);
            // Perform it and get a report.
            report = await doJob(report);
            console.log(`Job ${id} finished (${nowString()})`);
            // Save the report and, if it was saved, archive the job.
            if (await writeDirReport(report)) {
              await archiveJob(job, jobFileName);
              isCompleted = true;
            }
          }
          catch(error) {
            console.log(`ERROR processing directory job (${(error as Error).message})`);
          }
          // If the job was not completed (it is not JSON, it failed, or its report was not saved), move it aside, so that it is not run again.
          if (! isCompleted) {
            await setAsideJob(jobFileName);
          }
          notYetRun = false;
        }
        // Otherwise, i.e. if the first one is not yet ready to do:
        else {
          // Report this.
          console.log(`All jobs in ${jobDir} not yet ready to do (${nowString()})`);
          // Wait for the specified interval.
          await wait(1000 * intervalInSeconds);
        }
      }
      // Otherwise, i.e. if there are no jobs in the watched directory:
      else {
        console.log(`No job in ${jobDir} (${nowString()})`);
        // Wait for the specified interval.
        await wait(1000 * intervalInSeconds);
      }
    }
    // If a fatal error was thrown:
    catch(error) {
      // Report this.
      console.log(`ERROR: Directory watching failed (${(error as Error).message}); watching aborted`);
      // Quit watching.
      break;
    }
  }
};
