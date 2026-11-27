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

  If the child fails with an uncaught exception or an unhandled rejection, it has not written the
  report, so it says which in its message, and the parent (procs/doActs.js) records the failure
  instead of reading the report (#217).
*/

// TYPE IMPORTS (erased in the emit, so they load nothing before the handlers)

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
      `ERROR: process.send threw ${(error as Error).message} trying to send message ${JSON.stringify(message)} to parent`
    );
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
  console.error(`ERROR:\n${(reason as Error | undefined)?.stack || 'Unhandled rejection'}`);
  sendMessage({
    status: 'error',
    error: 'unhandledRejection'
  });
  process.exit(1);
});

// IMPORTS

// Module to perform file operations.
import * as fs from 'fs/promises';
// Function to perform a test act.
import {performTestAct} from './testAct';

// FUNCTIONS
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
const args = process.argv;
// Perform the specified test act.
doTestAct(args[2], Number.parseInt(args[3]));
