/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  netWatch.test.js
  Unit tests of netWatch (netWatch.ts) against a local server. They need no browser: doJob is replaced with a mock. They cover the netWatch defects of #231: the chunks of a response were decoded one by one, so a UTF-8 character split between two chunks was garbled, and the log of a failed job request said "got got".
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const Module = require('module');

const repo = path.join(__dirname, '..');
// The jobs the mock doJob performed.
const performed = [];
const runFile = path.join(repo, 'run.js');
const runModule = new Module(runFile);
runModule.filename = runFile;
runModule.loaded = true;
runModule.exports = {
  doJob: async job => {
    performed.push(job);
    return {...job, jobData: {aborted: false}};
  }
};
require.cache[runFile] = runModule;
const {netWatch} = require('../netWatch');

// Returns a minimal valid job.
const validJob = what => ({
  id: 'nw-job',
  what,
  strict: true,
  standard: 'only',
  device: {id: 'default'},
  browserID: 'chromium',
  creationTimeStamp: '261128T1200',
  executionTimeStamp: '261128T1200',
  target: {what: 'Example', url: 'https://example.com/'},
  sources: {},
  acts: [{type: 'launch'}]
});
// Sends a text in two chunks, split inside its first multibyte character.
const sendSplit = (response, text) => {
  const bytes = Buffer.from(text, 'utf8');
  const at = bytes.findIndex(byte => byte > 0x7f) + 1;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.write(bytes.subarray(0, at));
  setTimeout(() => response.end(bytes.subarray(at)), 50);
};

test('a UTF-8 character split between response chunks is decoded, and a failed request is logged once as such', async () => {
  const what = 'café 漢字';
  const reports = [];
  let jobRequests = 0;
  const server = http.createServer((request, response) => {
    const parts = [];
    request.on('data', part => parts.push(part)).on('end', () => {
      if (request.url === '/api/job') {
        jobRequests++;
        // Drop the first request, so that netWatch logs a failed request and asks again.
        if (jobRequests === 1) {
          response.socket.destroy();
        }
        else {
          sendSplit(response, JSON.stringify(validJob(what)));
        }
      }
      else {
        reports.push(JSON.parse(Buffer.concat(parts).toString('utf8')));
        sendSplit(response, JSON.stringify({message: 'Rapport reçu'}));
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const {port} = server.address();
  const saveDir = fs.mkdtempSync(path.join(os.tmpdir(), 'testaro-netwatch-'));
  for (const name of ['NETWATCH_WORKER_ID', 'NETWATCH_WORKER_SECRET', 'NETWATCH_URL_AUTH', 'AGENT']) {
    delete process.env[name];
  }
  Object.assign(process.env, {
    NETWATCH_AUTH_TYPE: 'none',
    NETWATCH_URL_JOB: `http://127.0.0.1:${port}/api/job`,
    NETWATCH_URL_REPORT: `http://127.0.0.1:${port}/api/report`,
    REPORTDIR: saveDir
  });
  const log = [];
  const {log: consoleLog} = console;
  console.log = (...args) => log.push(args.join(' '));
  let isOK;
  try {
    isOK = await netWatch(false, 0, false);
  }
  finally {
    console.log = consoleLog;
    server.close();
    fs.rmSync(saveDir, {recursive: true, force: true});
  }
  const text = log.join('\n');
  assert.equal(isOK, true);
  assert.equal(performed.length, 1);
  assert.equal(performed[0].what, what);
  assert.equal(reports[0].report.what, what);
  assert.match(text, /Rapport reçu/);
  assert.match(text, /and got error message /);
  assert.doesNotMatch(text, /got got/);
});
