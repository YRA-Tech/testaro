/*
  © 2022–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jonathan Robert Pool.
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  netWatch.js
  Validator for network watching, covering all three auth types.
*/

// IMPORTS

const fs = require('fs/promises');
const client = require('http');

// CONSTANTS

const jobDir = `${__dirname}/../jobs/todo`;
const jobID = '240101T1200-simple-example';
const workerID = 'testaro1';
const workerSecret = 'testarosecret';
// Override netWatch environment variables with validation-specific ones.
process.env.NETWATCH_URL_JOB = 'http://localhost:3007/api/job';
process.env.NETWATCH_URL_REPORT = 'http://localhost:3007/api/report';
process.env.NETWATCH_WORKER_ID = workerID;
process.env.NETWATCH_WORKER_SECRET = workerSecret;
const {netWatch} = require('../../netWatch');
/*
  The authorization-header value netWatch is expected to send in header mode: per RFC 7617, Basic
  followed by base64 of testaro1:testarosecret. Intentionally a literal, not derived from the
  netWatch code, so an encoding regression there fails here.
*/
const workerAuth = 'Basic dGVzdGFybzE6dGVzdGFyb3NlY3JldA==';
// Auth types to be validated.
const authTypes = ['header', 'pathBody', 'none'];

// FUNCTIONS

// Returns an error description if a request carries wrong credentials for an auth type, else ''.
const credentialError = (authType, request, bodyObj) => {
  const authHeader = request.headers.authorization;
  if (authType === 'header') {
    if (authHeader !== workerAuth) {
      return 'authorization header missing or wrong';
    }
    if (bodyObj.agentPW !== undefined) {
      return 'agentPW unexpectedly in the request body';
    }
  }
  else if (authType === 'pathBody') {
    if (authHeader) {
      return 'authorization header unexpectedly present';
    }
    if (bodyObj.agentPW !== workerSecret) {
      return 'agentPW missing from or wrong in the request body';
    }
  }
  else {
    if (authHeader) {
      return 'authorization header unexpectedly present';
    }
    if (bodyObj.agentPW !== undefined) {
      return 'agentPW unexpectedly in the request body';
    }
  }
  return '';
};
// Validates netWatch with one auth type; returns whether the scenario succeeded.
const runScenario = authType => {
  return new Promise(resolveScenario => {
    process.env.NETWATCH_AUTH_TYPE = authType;
    let jobGiven = false;
    let noJobSent = false;
    let reportOK = false;
    let server;
    // Responds to a request with a JSON object and a status code.
    const respondWithObject = (object, response, statusCode = 200) => {
      response.statusCode = statusCode;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.end(JSON.stringify(object));
    };
    // Handles Testaro requests to the server.
    const requestHandler = (request, response) => {
      const {method} = request;
      // Ignore any trailing slash on the request URL.
      const url = request.url.replace(/\/$/, '');
      const bodyParts = [];
      request.on('error', err => {
        console.error(err);
      })
      .on('data', chunk => {
        bodyParts.push(chunk);
      })
      .on('end', async () => {
        let bodyObj = {};
        try {
          bodyObj = JSON.parse(bodyParts.join('') || '{}');
        }
        catch(error) {
          console.log(`Scenario ${authType} failure: non-JSON request body (${error.message})`);
        }
        // If the request carries wrong credentials for this auth type:
        const credError = credentialError(authType, request, bodyObj);
        if (credError) {
          // Report this and reject the request; netWatch is expected to abort on this.
          console.log(`Scenario ${authType} failure: ${credError}`);
          respondWithObject({error: 'ERROR: Authorization invalid'}, response, 401);
          server.close();
          return;
        }
        // Otherwise, if the request is a job request:
        if (method === 'POST' && url === '/api/job') {
          console.log(`Server got a job request from Testaro (${authType})`);
          // If this is the first job request of the scenario:
          if (! noJobSent) {
            // Send a no-job response, to validate the no-job branch.
            noJobSent = true;
            respondWithObject({}, response);
          }
          // Otherwise, i.e. if the no-job branch was already validated:
          else {
            // Respond with a job.
            const jobJSON = await fs.readFile(`${jobDir}/${jobID}.json`);
            response.setHeader('content-type', 'application/json; charset=utf-8');
            response.end(jobJSON);
            console.log(`Server sent job to Testaro (${authType})`);
            jobGiven = true;
          }
        }
        // Otherwise, if the request is a report submission:
        else if (method === 'POST' && url === '/api/report') {
          console.log(`Server got report from Testaro (${authType})`);
          const ack = {};
          // If a job was earlier given to Testaro:
          if (jobGiven) {
            // Check the report, including the worker identification.
            const {report} = bodyObj;
            if (
              report
              && report.acts
              && report.jobData
              && report.sources
              && report.sources.agent === workerID
            ) {
              ack.message = 'Success: Valid report submitted';
              reportOK = true;
            }
            else {
              ack.message = 'Failure: Report invalid or worker not identified';
            }
          }
          else {
            ack.message = 'ERROR: Report submitted before a job was given';
          }
          respondWithObject(ack, response);
          console.log(`Server responded: ${ack.message}`);
          // This ends the scenario, so stop the server.
          server.close();
          console.log('Server closed');
        }
        // Otherwise, i.e. if the request is neither:
        else {
          // Report this and reject the request.
          console.log(`Scenario ${authType} failure: unexpected request ${method} ${request.url}`);
          respondWithObject({error: 'ERROR: Request invalid'}, response, 404);
          server.close();
        }
      });
    };
    // Create a server.
    server = client.createServer({}, requestHandler);
    // Start the server listening for Testaro requests, then start a one-job watch.
    server.listen(3007, async () => {
      console.log(`Job and report server listening on port 3007 (auth type ${authType})`);
      const watchOK = await netWatch(false, 5, false);
      server.close();
      resolveScenario(reportOK && watchOK);
    });
  });
};

// OPERATION

// Impose a deadline, so a hang becomes a failure instead of a silent stall.
const watchdog = setTimeout(() => {
  console.log('Failure: netWatch validation timed out');
  process.exit(1);
}, 600000);
// Run the scenarios in sequence and exit with a code reporting the outcome.
(async () => {
  const failures = [];
  for (const authType of authTypes) {
    const isOK = await runScenario(authType);
    // Drop any kept-alive connections to the closed server before the next scenario.
    client.globalAgent.destroy();
    console.log(`Scenario ${authType}: ${isOK ? 'valid' : 'INVALID'}\n`);
    if (! isOK) {
      failures.push(authType);
    }
  }
  clearTimeout(watchdog);
  if (failures.length) {
    console.log(`Failure: Invalid scenarios: ${failures.join(', ')}`);
    process.exit(1);
  }
  else {
    console.log('Success: Valid reports submitted for all auth types');
    process.exit(0);
  }
})();
