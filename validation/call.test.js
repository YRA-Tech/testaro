/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  call.test.js
  Unit tests of the run command of the call module (call.ts), which performs a job from JOBDIR/todo, archives it in JOBDIR/done and saves its report in REPORTDIR/raw, each named after the job ID. They need no browser: their jobs are invalid, so doJob aborts them before any launch. They cover the naming of the files (#231): a job is archived, and its report saved, only if its ID cannot name a file outside those directories.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {spawnSync} = require('child_process');

const callFile = path.join(__dirname, '..', 'call.js');
// Runs node call run in a new directory whose todo subdirectory holds one job, and returns what it did.
const callRun = job => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testaro-call-'));
  const jobDir = path.join(root, 'jobs');
  const reportDir = path.join(root, 'reports');
  for (const dir of [path.join(jobDir, 'todo'), path.join(jobDir, 'done'), path.join(reportDir, 'raw')]) {
    fs.mkdirSync(dir, {recursive: true});
  }
  fs.writeFileSync(path.join(jobDir, 'todo', '261128T1200-job.json'), JSON.stringify(job));
  const result = spawnSync(process.execPath, [callFile, 'run'], {
    cwd: root,
    env: {...process.env, JOBDIR: jobDir, REPORTDIR: reportDir},
    encoding: 'utf8',
    timeout: 60000
  });
  const list = dir => fs.readdirSync(dir).sort();
  const outcome = {
    stdout: result.stdout,
    status: result.status,
    todo: list(path.join(jobDir, 'todo')),
    done: list(path.join(jobDir, 'done')),
    raw: list(path.join(reportDir, 'raw')),
    // From jobs/done and from reports/raw, ../../ leads to the test's own directory.
    escaped: fs.existsSync(path.join(root, 'escape.json')),
    report: null
  };
  if (outcome.raw.length) {
    outcome.report = JSON.parse(fs.readFileSync(path.join(reportDir, 'raw', outcome.raw[0]), 'utf8'));
  }
  fs.rmSync(root, {recursive: true, force: true});
  return outcome;
};
// An invalid job (it lacks strict and the rest), which doJob aborts without launching a browser.
const invalidJob = id => ({id, what: 'Example', acts: [{type: 'launch'}]});

test('a job with an ID that can name a file is archived, and its report saved', () => {
  const outcome = callRun(invalidJob('261128T1200-job'));
  assert.equal(outcome.status, 0);
  assert.deepEqual(outcome.todo, []);
  assert.deepEqual(outcome.done, ['261128T1200-job.json']);
  assert.deepEqual(outcome.raw, ['261128T1200-job.json']);
  assert.equal(outcome.report.jobData.aborted, true);
  assert.equal(outcome.report.jobData.abortMessage, 'Bad job strict');
});

test('a job whose ID could name a file outside the directories is left in todo, and nothing is saved', () => {
  const outcome = callRun(invalidJob('../../escape'));
  assert.equal(outcome.status, 0);
  assert.match(outcome.stdout, /Job ID "\.\.\/\.\.\/escape" cannot name a file/);
  assert.equal(outcome.escaped, false);
  assert.deepEqual(outcome.todo, ['261128T1200-job.json']);
  assert.deepEqual(outcome.done, []);
  assert.deepEqual(outcome.raw, []);
});
