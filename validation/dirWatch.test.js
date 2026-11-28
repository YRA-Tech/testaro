/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  dirWatch.test.js
  Unit tests of dirWatch (dirWatch.ts). They need no browser: doJob is replaced with a mock. They cover the dirWatch defect of #231: a job whose report could not be saved stayed in the todo directory (the error handler threw a ReferenceError), so a watch that continues after a job ran it again at once, forever. The same was true of a job file that is not JSON and of a job that fails. Each such job file is now moved to the failed directory. A report is not saved under a job ID that could name a file outside the report directory.
*/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const repo = path.join(__dirname, '..');
// The watched directories, which dirWatch reads from the environment when it loads.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'testaro-dirwatch-'));
const jobDir = path.join(root, 'jobs');
const reportDir = path.join(root, 'reports');
process.env.JOBDIR = jobDir;
process.env.REPORTDIR = reportDir;
// The jobs the mock doJob performed, and what it is to do.
const jobs = {behavior: 'ok', ids: []};
const runFile = path.join(repo, 'run.js');
const runModule = new Module(runFile);
runModule.filename = runFile;
runModule.loaded = true;
runModule.exports = {
  doJob: async job => {
    jobs.ids.push(job.id);
    if (jobs.behavior === 'throw') {
      throw new Error('job failed');
    }
    return {...job, jobData: {aborted: false}};
  }
};
require.cache[runFile] = runModule;
const {dirWatch} = require('../dirWatch');

test.after(() => {
  fs.rmSync(root, {recursive: true, force: true});
});

// Returns the file names in a subdirectory of the job directory.
const filesIn = subdir => fs.existsSync(path.join(jobDir, subdir)) ? fs.readdirSync(path.join(jobDir, subdir)).sort() : [];
// Empties the watched directories, puts one job file in todo, and makes the report directory, or a file in its place.
const setUp = (fileName, content, {reportDirIsFile = false} = {}) => {
  fs.rmSync(jobDir, {recursive: true, force: true});
  fs.rmSync(reportDir, {recursive: true, force: true});
  fs.mkdirSync(path.join(jobDir, 'todo'), {recursive: true});
  fs.writeFileSync(path.join(jobDir, 'todo', fileName), content);
  if (reportDirIsFile) {
    fs.writeFileSync(reportDir, 'not a directory');
  }
  jobs.ids = [];
};
// Runs a watch that ends after one job, and returns its log.
const watchOnce = async () => {
  const log = [];
  const {log: consoleLog} = console;
  console.log = (...args) => log.push(args.join(' '));
  try {
    await dirWatch(false, 5);
  }
  finally {
    console.log = consoleLog;
  }
  return log.join('\n');
};
const job = id => JSON.stringify({id, what: 'Example', acts: [{type: 'launch'}]});

test('a completed job is archived and its report saved', async () => {
  setUp('261128T1200-a.json', job('261128T1200-a'));
  await watchOnce();
  assert.deepEqual(jobs.ids, ['261128T1200-a']);
  assert.deepEqual(filesIn('todo'), []);
  assert.deepEqual(filesIn('done'), ['261128T1200-a.json']);
  assert.deepEqual(filesIn('failed'), []);
  assert.ok(fs.existsSync(path.join(reportDir, 'raw', '261128T1200-a.json')));
});

test('a job whose report cannot be saved is moved to failed, not left to run again', async () => {
  setUp('261128T1200-b.json', job('261128T1200-b'), {reportDirIsFile: true});
  const log = await watchOnce();
  assert.deepEqual(jobs.ids, ['261128T1200-b']);
  assert.match(log, new RegExp(`Failed to save report 261128T1200-b in ${reportDir}/raw`));
  assert.doesNotMatch(log, /is not defined/);
  assert.deepEqual(filesIn('todo'), []);
  assert.deepEqual(filesIn('done'), []);
  assert.deepEqual(filesIn('failed'), ['261128T1200-b.json']);
});

test('a job file that is not JSON is moved to failed', async () => {
  setUp('261128T1200-c.json', '{not JSON');
  await watchOnce();
  assert.deepEqual(jobs.ids, []);
  assert.deepEqual(filesIn('todo'), []);
  assert.deepEqual(filesIn('failed'), ['261128T1200-c.json']);
});

test('a job that fails is moved to failed', async () => {
  setUp('261128T1200-d.json', job('261128T1200-d'));
  jobs.behavior = 'throw';
  try {
    await watchOnce();
  }
  finally {
    jobs.behavior = 'ok';
  }
  assert.deepEqual(jobs.ids, ['261128T1200-d']);
  assert.deepEqual(filesIn('todo'), []);
  assert.deepEqual(filesIn('failed'), ['261128T1200-d.json']);
});

test('a report whose job ID could name a file outside the directories is not saved, and the job is moved to failed', async () => {
  // From reports/raw and from jobs/done, ../../ leads to the test's own directory.
  setUp('261128T1200-e.json', job('../../escape'));
  const log = await watchOnce();
  assert.deepEqual(jobs.ids, ['../../escape']);
  assert.match(log, /Job ID "\.\.\/\.\.\/escape" cannot name a file/);
  assert.equal(fs.existsSync(path.join(root, 'escape.json')), false);
  assert.deepEqual(filesIn('done'), []);
  assert.deepEqual(filesIn('failed'), ['261128T1200-e.json']);
});

