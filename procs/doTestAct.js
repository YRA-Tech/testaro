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
  the act with procs/testAct.js, writes the revised report, and messages the parent.
*/

// ERROR LOGGING

// Log uncaught exceptions.
process.on('uncaughtException', error => {
  console.error(`ERROR:\n${error.stack || 'Uncaught exception'}`);
  process.exit(1);
});

// Log unhandled rejections.
process.on('unhandledRejection', reason => {
  console.error(`ERROR:\n${reason?.stack || 'Unhandled rejection'}`);
  process.exit(1);
});

// IMPORTS

// Module to perform file operations.
const fs = require('fs/promises');
// Function to perform a test act.
const {performTestAct} = require('./testAct');

// FUNCTIONS

// Sends a message to the parent process.
const sendMessage = message => {
  try {
    if (typeof process.send === 'function') {
      process.send(message);
    }
  }
  catch(error) {
    console.log(
      `ERROR: process.send threw ${error.message} trying to send message ${message} to parent`
    );
  }
};
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
    await performTestAct({report, actIndex});
    // If the launch aborted the job or no page existed, report that.
    if (report.jobData?.aborted) {
      status = 'error';
      error = 'Page launch aborted';
    }
    else if (act.data?.prevented && act.data.error === 'No page') {
      status = 'error';
      error = 'ERROR: No page';
    }
  }
  // If the tool invocation failed:
  catch(err) {
    console.log(`ERROR: Test act ${act.which} failed (${err.message.slice(0, 400)})`);
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
  const message = error && error.message ? error.message : String(error);
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
