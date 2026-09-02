/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  repro-metarefresh.js
  Minimal reproduction: page.close() intermittently NEVER SETTLES (neither
  resolves nor rejects) when the page performed a meta-refresh(0) navigation
  that interrupted an in-flight evaluate. See playwright-issue-draft.md.
  Observed on playwright 1.62.1, Chromium headless: ~50% of rounds hang.
  Run from the repository root: node validation/act/repro-metarefresh.js
*/

const http = require('http');
const {chromium} = require('playwright');

const pages = {
  '/a.html': `<!DOCTYPE html><html lang="en"><head><title>a</title>
    <meta http-equiv="refresh" content="0; URL='/target.html'"></head>
    <body><p>redirecting</p></body></html>`,
  '/target.html': `<!DOCTYPE html><html lang="en"><head><title>t</title></head>
    <body><p>arrived</p></body></html>`
};

// Reports whether a promise settles within ms.
const settles = (promise, ms) => Promise.race([
  promise.then(() => 'resolved').catch(() => 'rejected'),
  new Promise(resolve => setTimeout(() => resolve('NEVER SETTLED'), ms))
]);

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(pages[req.url] || pages['/target.html']);
  });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const context = await browser.newContext();
  let hangs = 0;
  const ROUNDS = 10;
  for (let round = 0; round < ROUNDS; round++) {
    const page = await context.newPage();
    await page.goto(`${base}/a.html`, {waitUntil: 'load'});
    // An evaluate for the meta refresh to interrupt (it rejects with
    // "Execution context was destroyed" — expected and irrelevant).
    await page.evaluate(
      () => new Promise(resolve => setTimeout(resolve, 100))
    ).catch(() => {});
    const outcome = await settles(page.close(), 10000);
    console.log(`round ${round}: page.close() ${outcome}`);
    if (outcome === 'NEVER SETTLED') {
      hangs++;
    }
  }
  console.log(`${hangs}/${ROUNDS} rounds hung`);
  await Promise.race([browser.close(), new Promise(r => setTimeout(r, 5000))]);
  server.close();
  process.exit(hangs ? 1 : 0);
})();
