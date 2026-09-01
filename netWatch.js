/*
  © 2022–2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  netWatch.js
  Module for watching for a network job and running it when found.
*/

// IMPORTS

// Module to keep secrets.
require('dotenv').config();
// Module to access files.
const fs = require('fs/promises');
// Module to validate jobs.
const {isValidJob} = require('./procs/job');
// Modules to make requests to servers.
const httpClient = require('http');
const httpsClient = require('https');
// Module to perform jobs.
const {doJob} = require('./run');
// Module to process dates and times.
const {nowString} = require('./procs/dateTime');

// CONSTANTS

// Auth types and the environment variables each one requires.
const authRequirements = {
  none: [],
  pathBody: ['NETWATCH_WORKER_SECRET'],
  header: ['NETWATCH_WORKER_ID', 'NETWATCH_WORKER_SECRET']
};

// FUNCTIONS

// Returns the URL represented by a string, or null if invalid.
const toURL = urlString => {
  try {
    return new URL(urlString);
  }
  catch(error) {
    return null;
  }
};
// Waits.
const wait = ms => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve('');
    }, ms);
  });
};
// Returns the value of a basic authorization header for a worker ID and secret.
const basicAuthHeader = (workerID, workerSecret) =>
  `Basic ${Buffer.from(`${workerID}:${workerSecret}`).toString('base64')}`;
// Returns the netWatch configuration from the environment, with any problems named.
const getConfig = () => {
  const problems = [];
  const warnings = [];
  let authType = process.env.NETWATCH_AUTH_TYPE;
  let workerID = process.env.NETWATCH_WORKER_ID;
  let workerSecret = process.env.NETWATCH_WORKER_SECRET;
  // If the worker ID is specified only by the deprecated AGENT variable:
  if (! workerID && process.env.AGENT) {
    // Adopt it and warn about the deprecation.
    workerID = process.env.AGENT;
    warnings.push('AGENT is deprecated; rename it to NETWATCH_WORKER_ID');
  }
  // If the auth type is unspecified but the deprecated NETWATCH_URL_AUTH variable exists:
  if (! authType && process.env.NETWATCH_URL_AUTH) {
    // Treat the configuration as a pathBody configuration and warn about the deprecation.
    authType = 'pathBody';
    workerSecret ||= process.env.NETWATCH_URL_AUTH;
    warnings.push(
      'NETWATCH_URL_AUTH is deprecated; set NETWATCH_AUTH_TYPE=pathBody and NETWATCH_WORKER_SECRET'
    );
  }
  // If no auth configuration exists at all:
  if (! authType && ! workerSecret) {
    // Treat the configuration as an unauthenticated configuration and warn about this.
    authType = 'none';
    warnings.push('NETWATCH_AUTH_TYPE not set; defaulting to none (no credentials sent)');
  }
  const jobURL = toURL(process.env.NETWATCH_URL_JOB);
  const reportURL = toURL(process.env.NETWATCH_URL_REPORT);
  // Identify any problems with the configuration, naming the offending variables.
  if (! jobURL) {
    problems.push(`NETWATCH_URL_JOB missing or not a valid URL (${process.env.NETWATCH_URL_JOB})`);
  }
  if (! reportURL) {
    problems.push(
      `NETWATCH_URL_REPORT missing or not a valid URL (${process.env.NETWATCH_URL_REPORT})`
    );
  }
  if (! Object.keys(authRequirements).includes(authType)) {
    problems.push(
      `NETWATCH_AUTH_TYPE (${authType}) not one of ${Object.keys(authRequirements).join(', ')}`
    );
  }
  else {
    const varValues = {
      NETWATCH_WORKER_ID: workerID,
      NETWATCH_WORKER_SECRET: workerSecret
    };
    authRequirements[authType].forEach(varName => {
      if (! varValues[varName]) {
        problems.push(`${varName} required when NETWATCH_AUTH_TYPE is ${authType}`);
      }
    });
    // If the worker ID contains a colon, prohibited in basic authentication by RFC 7617:
    if (authType === 'header' && workerID && workerID.includes(':')) {
      problems.push('NETWATCH_WORKER_ID must not contain a colon');
    }
    // If any credential is not ASCII-only, so servers may decode it differently:
    if ([workerID, workerSecret].some(value => value && /[^\x20-\x7e]/.test(value))) {
      warnings.push(
        'NETWATCH_WORKER_ID or NETWATCH_WORKER_SECRET contains non-ASCII characters, which servers may decode differently'
      );
    }
  }
  return {problems, warnings, jobURL, reportURL, authType, workerID, workerSecret};
};
// Saves a report that could not be submitted, so it is not lost.
const saveFailedReport = async report => {
  try {
    const saveDir = `${process.env.REPORTDIR || '.'}/netWatchFailed`;
    await fs.mkdir(saveDir, {recursive: true});
    const savePath = `${saveDir}/${report && report.id || 'report'}.json`;
    await fs.writeFile(savePath, JSON.stringify(report, null, 2));
    console.log(`Unsubmitted report saved at ${savePath}`);
  }
  catch(error) {
    console.log(`ERROR saving unsubmitted report (${error.message})`);
  }
};
/*
  Requests a network job and, when found, performs and reports it.
  Arguments:
  0. whether to continue watching after a job is run.
  1: interval in seconds from a no-job check to the next check.
  2. whether to ignore unknown-certificate errors from a watched server (default false).
  Returns whether watching ended without an abort, an invalid configuration, or a lost report.
*/
exports.netWatch = async (isForever, intervalInSeconds, isCertTolerant = false) => {
  const {problems, warnings, jobURL, reportURL, authType, workerID, workerSecret} = getConfig();
  // Report any warnings about the configuration.
  warnings.forEach(warning => {
    console.log(`WARNING: ${warning}`);
  });
  // If the netWatch configuration is invalid:
  if (problems.length) {
    // Report each problem and quit.
    problems.forEach(problem => {
      console.log(`ERROR: ${problem}`);
    });
    console.log('ERROR: Configuration of netWatch is invalid');
    return false;
  }
  // Configure the watch.
  const headers = {
    'content-type': 'application/json; charset=utf-8'
  };
  if (authType === 'header') {
    headers.authorization = basicAuthHeader(workerID, workerSecret);
  }
  // Body properties transmitting the credentials, if the auth type requires them there.
  const authBody = authType === 'pathBody' ? {agentPW: workerSecret} : {};
  const jobRequestJSON = JSON.stringify(authBody);
  // Returns the client and request options for a request to a URL.
  const requestConfigFor = url => {
    const options = {
      method: 'POST',
      headers: {... headers}
    };
    let client = httpClient;
    if (url.protocol === 'https:') {
      client = httpsClient;
      options.rejectUnauthorized = ! isCertTolerant;
    }
    return {client, options};
  };
  // If certificate tolerance would expose credentials on an encrypted connection:
  if (isCertTolerant && [jobURL, reportURL].some(url => url.protocol === 'https:')) {
    // Warn about this.
    console.log(
      'WARNING: Certificate tolerance disables certificate verification, so credentials and reports are exposed to interception'
    );
  }
  let noJobYet = true;
  let abort = false;
  let reportLost = false;
  const jobHost = jobURL.host;
  const certInfo = `Certificate-${isCertTolerant ? '' : 'in'}tolerant`;
  const foreverInfo = isForever ? 'repeating' : 'one-job';
  const intervalInfo = `with ${intervalInSeconds}-second intervals`;
  console.log(
    `${certInfo} ${foreverInfo} network watching started ${intervalInfo} (${nowString()})\n`
  );
  // As long as watching is to continue:
  while ((isForever || noJobYet) && ! abort) {
    // Log the start of a check.
    console.log('--');
    // Configure the next check.
    const logStart = `Requested job from ${jobHost} and got `;
    // Perform it.
    await new Promise(resolve => {
      // Ensure the check is concluded at most once, so error events cannot start overlapping checks.
      let settled = false;
      let jobDispatched = false;
      const finish = () => {
        if (! settled) {
          settled = true;
          resolve(true);
        }
      };
      const finishAfterWait = async () => {
        if (! settled) {
          // Wait for the specified interval.
          await wait(1000 * intervalInSeconds);
          finish();
        }
      };
      try {
        // Get the client and request options for a job request.
        const {client, options} = requestConfigFor(jobURL);
        // Request a job.
        client.request(jobURL, options, response => {
          // Initialize a collection of data from the response.
          const chunks = [];
          response
          // If the response throws an error:
          .on('error', error => {
            // Report it.
            console.log(`${logStart}error message ${error.message}`);
            // Unless a job is already being performed, wait and conclude the check.
            if (! jobDispatched) {
              finishAfterWait();
            }
          })
          // If the response delivers data:
          .on('data', chunk => {
            // Add them to the collection.
            chunks.push(chunk);
          })
          // When the response is completed:
          .on('end', async () => {
            const content = chunks.join('');
            const {statusCode} = response;
            // If the server reported a failure:
            if (statusCode < 200 || statusCode > 299) {
              // Report it.
              console.log(
                `ERROR: ${logStart}status ${statusCode} and response ${content.slice(0, 1000)}`
              );
              // If it was an authentication or authorization rejection:
              if ([401, 403].includes(statusCode)) {
                // Abort the watch, because rechecking cannot succeed until it is reconfigured.
                abort = true;
                finish();
              }
              // Otherwise, i.e. if the failure may be transient:
              else {
                // Wait and conclude the check.
                finishAfterWait();
              }
              return;
            }
            try {
              // Parse it as a JSON job.
              let contentObj = JSON.parse(content);
              const {id} = contentObj;
              // If it is a no-job message:
              if (! Object.keys(contentObj).length) {
                // Report this.
                console.log(`${logStart}no job to do; waiting ${intervalInSeconds} sec before next check`);
                // Wait and conclude the check.
                finishAfterWait();
              }
              // Otherwise, if it is a job:
              else if (id) {
                // Check it for validity.
                const jobValidity = isValidJob(contentObj);
                // If it is invalid:
                if (! jobValidity.isValid) {
                  // Report this.
                  console.log(`${logStart}invalid job (${jobValidity.error})`);
                  // Wait and conclude the check.
                  finishAfterWait();
                }
                // Otherwise, i.e. if it is valid:
                else {
                  // Prevent further watching, if unwanted.
                  noJobYet = false;
                  jobDispatched = true;
                  // Identify this worker in the report, if a worker ID exists.
                  if (workerID && contentObj.sources) {
                    contentObj.sources.agent = workerID;
                  }
                  console.log(`${logStart}job ${id} (${nowString()})`);
                  try {
                    // Perform the job and create a report.
                    const report = await doJob(contentObj);
                    // Make it the report property of the response body, with any body credentials.
                    const responseObj = {
                      ... authBody,
                      report
                    };
                    let responseJSON = JSON.stringify(responseObj, null, 2);
                    console.log(`Job ${id} finished (${nowString()})`);
                    const reportLogStart = `Submitted report ${id} to ${reportURL} and got `;
                    // Get the client and request options for a report-submission request.
                    const {client: repClient, options: repOptions} = requestConfigFor(reportURL);
                    // Submit the report.
                    repClient.request(reportURL, repOptions, repResponse => {
                      // Initialize a collection of data from the response.
                      const repChunks = [];
                      repResponse
                      // If the response to the report threw an error:
                      .on('error', error => {
                        // Report this.
                        console.log(`${reportLogStart}error message ${error.message}\n`);
                        // Wait and conclude the check.
                        finishAfterWait();
                      })
                      // If the response delivers data:
                      .on('data', chunk => {
                        // Add them to the collection.
                        repChunks.push(chunk);
                      })
                      // When the response to the report is completed:
                      .on('end', async () => {
                        const repContent = repChunks.join('');
                        const repStatusCode = repResponse.statusCode;
                        // If the server reported a failure:
                        if (repStatusCode < 200 || repStatusCode > 299) {
                          // Report this and save the report, so it is not lost.
                          console.log(
                            `ERROR: ${reportLogStart}status ${repStatusCode} and response ${repContent.slice(0, 1000)}\n`
                          );
                          reportLost = true;
                          await saveFailedReport(report);
                        }
                        // Otherwise, i.e. if the server accepted the report:
                        else {
                          try {
                            // Parse the acknowledgement as JSON.
                            const ackObj = JSON.parse(repContent);
                            // Report it.
                            console.log(
                              `${reportLogStart}response message: ${JSON.stringify(ackObj, null, 2)}\n`
                            );
                          }
                          // If it is not JSON:
                          catch(error) {
                            // Report this.
                            console.log(
                              `ERROR: ${reportLogStart}status ${repStatusCode}, error message ${error.message}, and response ${repContent.slice(0, 1000)}\n`
                            );
                          }
                        }
                        // Free the memory used by the job and the report.
                        contentObj = {};
                        responseJSON = '';
                        finish();
                      });
                    })
                    // If the report submission throws an error:
                    .on('error', async error => {
                      // Abort the watch.
                      abort = true;
                      // Report this and save the report, so it is not lost.
                      console.log(
                        `ERROR ${error.code} in report submission: ${reportLogStart}error message ${error.message}\n`
                      );
                      reportLost = true;
                      await saveFailedReport(report);
                      finish();
                    })
                    // Finish submitting the report.
                    .end(responseJSON);
                  }
                  catch(error) {
                    console.log(`ERROR performing job ${id} (${error.message})`);
                    // Wait and conclude the check.
                    finishAfterWait();
                  }
                }
              }
              // Otherwise, i.e. if it is a message:
              else {
                // Report it.
                console.log(`${logStart}${JSON.stringify(contentObj, null, 2)}`);
                // Wait and conclude the check.
                finishAfterWait();
              }
            }
            // Otherwise, i.e. if it is not JSON:
            catch(error) {
              // Report this.
              console.log(`ERROR: ${logStart}status ${response.statusCode}, error message ${error.message}, and non-JSON response ${content.slice(0, 1000)}\n`);
              // Wait and conclude the check.
              finishAfterWait();
            }
          });
        })
        // If the job request throws an error:
        .on('error', error => {
          // If it is a refusal to connect:
          if (error.code && error.code.includes('ECONNREFUSED')) {
            // Report this.
            console.log(`${logStart}no connection`);
          }
          // Otherwise, if it was a DNS failure:
          else if (error.code && error.code.includes('ENOTFOUND')) {
            // Report this.
            console.log(`${logStart}no domain name resolution`);
          }
          // Otherwise, if it was any other error with a message:
          else if (error.message) {
            // Report this.
            console.log(`ERROR: ${logStart}got error message ${error.message.slice(0, 200)}`);
          }
          // Otherwise, i.e. if it was any other error with no message:
          else {
            // Report this.
            console.log(`ERROR: ${logStart}got an error with no message`);
          }
          // Unless a job is already being performed, wait and conclude the check.
          if (! jobDispatched) {
            finishAfterWait();
          }
        })
        // Finish sending the job request.
        .end(jobRequestJSON);
      }
      // If requesting a job throws an error:
      catch(error) {
        // Report this.
        console.log(`ERROR requesting a network job (${error.message})`);
        // Wait and conclude the check.
        finishAfterWait();
      }
    });
  }
  console.log(`Watching ${abort ? 'aborted' : 'complete'}`);
  return ! (abort || reportLost);
};
exports.basicAuthHeader = basicAuthHeader;
