/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  doJob.test.js
  Unit tests of doJob (run.ts). They need no browser: doActs and getCatalog are replaced with mocks. They cover the doJob defects of #231: the temporary directory was named by the job ID, so an ID containing "../" named a directory elsewhere, which doJob deleted at the end of the job (such an ID now makes the job invalid, and the directory name is reduced to safe characters besides); doJob added a message listener to the process for every job; and a job whose job data was not an object was reported as invalid without recording the abort. A directory that these tests could delete if doJob regressed is one the tests create for the purpose.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const repo = path.join(__dirname, '..');
const tmpBase = path.join(repo, 'tmp');
// What the mock doActs saw, and what it is to do.
const acts = {behavior: 'ok', seen: []};
// Replaces a module with a mock before anything requires it.
const mock = (file, exports) => {
  const resolved = path.join(repo, file);
  const m = new Module(resolved);
  m.filename = resolved;
  m.loaded = true;
  m.exports = exports;
  require.cache[resolved] = m;
};
mock('procs/doActs.js', {
  doActs: async report => {
    const {tmpDir} = report.jobData;
    acts.seen.push({tmpDir, existed: fs.existsSync(tmpDir), listeners: process.listenerCount('message')});
    // Leave a file in the directory, as a job's temporary report would be.
    fs.writeFileSync(path.join(tmpDir, 'report.json'), '{}');
    if (acts.behavior === 'throw') {
      throw new Error('acts failed');
    }
    return report;
  }
});
mock('procs/catalog.js', {getCatalog: async () => ({})});
const {doJob} = require('../run');

// Returns a minimal valid job.
const validJob = id => ({
  id,
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

test('the temporary directory is new, in tmp/, named after the job ID, and deleted at the end', async () => {
  acts.seen = [];
  const report = await doJob(validJob('dt-job'));
  const [{tmpDir, existed}] = acts.seen;
  assert.equal(existed, true);
  assert.equal(path.dirname(tmpDir), tmpBase);
  assert.match(path.basename(tmpDir), /^dt-job-.{6}$/);
  assert.equal(report.jobData.tmpDir, tmpDir);
  assert.equal(fs.existsSync(tmpDir), false);
});

test('two jobs with the same ID at once get directories of their own', async () => {
  acts.seen = [];
  await Promise.all([doJob(validJob('dt-twin')), doJob(validJob('dt-twin'))]);
  assert.equal(acts.seen.length, 2);
  assert.notEqual(acts.seen[0].tmpDir, acts.seen[1].tmpDir);
});

test('a job ID containing ../ makes the job invalid, and doJob creates or deletes nothing for it', async () => {
  const victim = fs.mkdtempSync(path.join(os.tmpdir(), 'testaro-victim-'));
  fs.writeFileSync(path.join(victim, 'canary.txt'), 'canary');
  try {
    acts.seen = [];
    const report = await doJob(validJob(path.relative(tmpBase, victim)));
    assert.deepEqual(acts.seen, []);
    assert.equal(report.jobData.aborted, true);
    assert.equal(report.jobData.abortMessage, 'Bad job ID (must not contain /, \\, or control characters)');
    assert.equal(fs.readFileSync(path.join(victim, 'canary.txt'), 'utf8'), 'canary');
  }
  finally {
    fs.rmSync(victim, {recursive: true, force: true});
  }
});

test('the directory name keeps only letters, digits, _, . and - from the job ID', async () => {
  acts.seen = [];
  await doJob(validJob('café ünï'));
  const [{tmpDir}] = acts.seen;
  assert.equal(path.dirname(tmpDir), tmpBase);
  assert.match(path.basename(tmpDir), /^caf___n_-.{6}$/);
});

test('the temporary directory is deleted when the job fails', async () => {
  acts.seen = [];
  acts.behavior = 'throw';
  try {
    await assert.rejects(doJob(validJob('dt-fail')), /acts failed/);
  }
  finally {
    acts.behavior = 'ok';
  }
  assert.equal(fs.existsSync(acts.seen[0].tmpDir), false);
});

test('doJob listens for an interrupt during a job and leaves no listener after it', async () => {
  const before = process.listenerCount('message');
  acts.seen = [];
  await doJob(validJob('dt-listen-1'));
  await doJob(validJob('dt-listen-2'));
  assert.deepEqual(acts.seen.map(seen => seen.listeners), [before + 1, before + 1]);
  assert.equal(process.listenerCount('message'), before);
});

test('job data that is not an object is replaced, and the abort is recorded', async () => {
  for (const jobData of ['x', 7, true]) {
    const events = [];
    const report = await doJob({...validJob('dt-data'), jobData}, {onProgress: event => events.push(event)});
    assert.equal(report.jobData.aborted, true, JSON.stringify(jobData));
    assert.equal(report.jobData.abortedAct, null);
    assert.equal(report.jobData.abortMessage, 'Bad job jobData');
    assert.deepEqual(events.at(-1), {event: 'jobEnd', id: 'dt-data', aborted: true});
  }
});
