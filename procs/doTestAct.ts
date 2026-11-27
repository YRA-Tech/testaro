/*
  © 2024–2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  doTestAct
  Performs the tests of an act, under process isolation.
  This file is designed to be run as a child process: it reads the temporary report, performs
  the act with procs/testAct.js, writes the revised report, and messages the parent with a
  TestActMessage (types.ts). Compiled to doTestAct.js by tsc (issue #73); edit this file, not
  the emitted one. The imports follow the error handlers, as the requires did, so that an error
  while loading the modules is handled.

  Kept as it is (issue #73; see #217): each process event has two handlers, and the first exits
  the process, so the second, which messages the parent, never runs.
*/

// ERROR LOGGING

// Log uncaught exceptions.
process.on('uncaughtException', error => {
  console.error(`ERROR:\n${error.stack || 'Uncaught exception'}`);
  process.exit(1);
});

// Log unhandled rejections.
process.on('unhandledRejection', reason => {
  console.error(`ERROR:\n${(reason as Error | undefined)?.stack || 'Unhandled rejection'}`);
  process.exit(1);
});

// IMPORTS

// Module to perform file operations.
import * as fs from 'fs/promises';
// Function to perform a test act.
import {performTestAct} from './testAct';
import type {Report, TestActMessage} from '../types';

// FUNCTIONS

// Sends a message to the parent process.
const sendMessage = (message: TestActMessage) => {
  try {
    if (typeof process.send === 'function') {
      process.send(message);
    }
  }
  catch(error) {
    console.log(
      `ERROR: process.send threw ${(error as Error).message} trying to send message ${message} to parent`
    );
  }
};
// Performs tests of a test act.
const doTestAct = async (reportPath: string, actIndex: number) => {
  // Get the temporary report.
  const reportJSON = await fs.readFile(reportPath, 'utf8');
  const report: Report = JSON.parse(reportJSON);
  const act = report.acts[actIndex];
  let status: TestActMessage['status'] = 'ok';
  let error = '';
  try {
    // Perform the act, revising the report.
    const {noPage} = await performTestAct({report, actIndex});
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
  catch(err) {
    console.log(`ERROR: Test act ${act.which} failed (${(err as Error).message.slice(0, 400)})`);
    status = 'error';
    error = 'ERROR performing the act';
  }
  // Save the revised report and report the outcome to the parent.
  await fs.writeFile(reportPath, JSON.stringify(report));
  sendMessage(status === 'ok' ? {status} : {status, error});
  process.exit(status === 'ok' ? 0 : 1);
};
process.on('uncaughtException', error => {
  console.log(`ERROR: uncaughtException (${error.message})`);
  sendMessage({
    status: 'error',
    error: 'uncaughtException'
  });
  process.exit(1);
});
process.on('unhandledRejection', error => {
  const message = error && (error as Error).message ? (error as Error).message : String(error);
  console.log(`ERROR: unhandledRejection (${message})`);
  sendMessage({
    status: 'error',
    error: 'unhandledRejection'
  });
  process.exit(1);
});
const args = process.argv;
// Perform the specified test act.
doTestAct(args[2], Number.parseInt(args[3]));
