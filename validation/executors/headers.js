/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  headers.js
  Validator for the request headers that launches add to the requests of a page (issue #205).

  A request header that is not CORS-safelisted, added to every request, makes the browser
  preflight every cross-origin request that a page makes in CORS mode (web fonts, fetch calls),
  and block it when the server does not allow the header. So this validator serves a page from
  one local origin with resources from a second, launches it with a scanner identity, and checks
  that the site gets the scanner header, that the other origin gets neither it nor a preflight,
  and that the page's cross-origin requests succeed.

  Execution examples:
    npm run headers
    npm run headers chromium firefox
*/

// IMPORTS

const http = require('http');
const {browserClose, launch} = require('../../procs/launch');

// CONSTANTS

const scannerId = 'HeaderValidator/1.0';
const browserIDs = process.argv.slice(2).length ? process.argv.slice(2) : ['chromium', 'webkit', 'firefox'];

// FUNCTIONS

// Starts a server on a free local port and returns it with its origin and its request log.
const serve = handler => new Promise(resolve => {
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push({
      method: request.method,
      path: request.url,
      scanner: request.headers['x-yra-scanner'] || '',
      upgrade: request.headers['upgrade-insecure-requests'] || ''
    });
    handler(request, response);
  });
  server.listen(0, '127.0.0.1', () => {
    resolve({server, requests, origin: `http://127.0.0.1:${server.address().port}`});
  });
});
// Sends a response.
const send = (response, status, type, body, headers = {}) => {
  response.writeHead(status, {...(type ? {'Content-Type': type} : {}), ...headers});
  response.end(body);
};
// Returns an HTML document.
const html = (title, body) => `<!DOCTYPE html><html lang="en"><head><title>${title}</title></head><body>${body}</body></html>`;
// Starts the three servers: the site, a second host of the site, and another party.
const startServers = async () => {
  // The other party allows any origin, but its preflight responses allow no request header.
  const other = await serve((request, response) => {
    const cors = {'Access-Control-Allow-Origin': '*'};
    const path = request.url.split('?')[0];
    if (request.method === 'OPTIONS') {
      send(response, 204, '', '', cors);
    }
    else if (path === '/font.woff2') {
      send(response, 200, 'font/woff2', 'not a font', cors);
    }
    else if (path === '/api') {
      send(response, 200, 'text/plain', 'ok', cors);
    }
    else if (path === '/frame') {
      send(response, 200, 'text/html', html('Frame', '<p>Frame</p><script>fetch("/api?frame")</script>'));
    }
    else {
      send(response, 200, 'image/png', '');
    }
  });
  const second = await serve((request, response) => {
    const path = request.url.split('?')[0];
    if (path === '/landed') {
      send(response, 200, 'text/html', html('Landed', '<h1>Landed</h1><script>fetch("/api?landed")</script>'));
    }
    else {
      send(response, 200, 'text/plain', 'ok');
    }
  });
  const site = await serve((request, response) => {
    const path = request.url.split('?')[0];
    if (path === '/') {
      send(response, 200, 'text/html', html('Site', `<style>
        @font-face {font-family: Other; src: url(${other.origin}/font.woff2)}
        p {font-family: Other, serif}
        </style>
        <h1>Site</h1><p>Text in a font from another origin.</p>
        <img src="${other.origin}/image.png" alt="">
        <iframe src="${other.origin}/frame" title="other party"></iframe>
        <iframe src="/inner" title="same origin"></iframe>
        <script>
        window.fetched = {};
        const get = (name, url) => fetch(url).then(response => response.text())
        .then(text => fetched[name] = text).catch(() => fetched[name] = 'blocked');
        get('same', '/api?page');
        get('other', '${other.origin}/api?page');
        </script>`));
    }
    else if (path === '/inner') {
      send(response, 200, 'text/html', html('Inner', '<p>Inner</p><script>fetch("/api?inner")</script>'));
    }
    else if (path === '/redirect') {
      send(response, 302, '', '', {Location: `${second.origin}/landed`});
    }
    else {
      send(response, 200, 'text/plain', 'ok');
    }
  });
  return {site, second, other};
};
// Launches a page in a browser type and returns it.
const visit = async (browserID, url, withScannerId) => {
  // A job with the properties that a launch requires.
  const report = {
    id: 'headers',
    what: 'Header validation',
    strict: false,
    standard: 'only',
    observe: false,
    timeLimit: 60,
    creationTimeStamp: '260101T0000',
    executionTimeStamp: '260101T0000',
    sources: {},
    browserID,
    target: {what: 'header validation', url},
    device: {id: 'default', windowOptions: {}},
    navigation: {waitUntil: 'load', rotateBrowsers: false},
    acts: [{type: 'launch'}],
    jobData: {},
    ...(withScannerId ? {scannerId} : {})
  };
  const page = await launch({
    report, actIndex: 0, tempBrowserID: browserID, tempURL: url, xPathNeed: 'none', replay: false
  });
  if (! page) {
    const reason = report.acts[0].data?.error || report.acts[0].result?.error || report.jobData.abortMessage || '';
    throw new Error(`Launch of ${url} failed: ${String(reason).replace(/\s+/g, ' ').slice(0, 300)}`);
  }
  return page;
};
// Validates the headers in a browser type and returns the count of failures.
const validate = async browserID => {
  let failureCount = 0;
  const check = (what, isOK, detail = '') => {
    console.log(`${isOK ? 'PASS' : 'FAIL'} ${browserID}: ${what}${isOK || ! detail ? '' : ` (${detail})`}`);
    if (! isOK) {
      failureCount++;
    }
  };
  // Returns the paths of the logged requests that lack, or that have, the scanner header.
  const paths = (requests, withScanner) => requests
  .filter(request => Boolean(request.scanner) === withScanner)
  .map(request => `${request.method} ${request.path}`);
  const servers = await startServers();
  const {site, second, other} = servers;
  const clear = () => [site, second, other].forEach(({requests}) => requests.length = 0);
  const {log} = console;
  try {
    // Visit the site with a scanner identity, without logging by the launch.
    console.log = () => {};
    let page = await visit(browserID, `${site.origin}/`, true);
    await page.waitForFunction(() => window.fetched.same && window.fetched.other, null, {timeout: 10000})
    .catch(() => {});
    const fetched = await page.evaluate(() => window.fetched);
    // Allow the requests of the frames to arrive.
    await page.waitForTimeout(500);
    await browserClose(page);
    console.log = log;
    check('the site got its requests', site.requests.length >= 4, `${site.requests.length} requests`);
    check(
      'every request to the site identifies the scanner',
      site.requests.every(request => request.scanner === scannerId || request.path === '/favicon.ico'),
      paths(site.requests, false).join(', ')
    );
    check(
      'no request to the other party identifies the scanner',
      other.requests.every(request => ! request.scanner),
      paths(other.requests, true).join(', ')
    );
    check(
      'the other party got no preflight request',
      other.requests.every(request => request.method !== 'OPTIONS'),
      other.requests.filter(request => request.method === 'OPTIONS').map(request => request.path).join(', ')
    );
    check(
      'the font from the other party was requested',
      other.requests.some(request => request.method === 'GET' && request.path === '/font.woff2')
    );
    check('the fetch from the other party succeeded', fetched.other === 'ok', fetched.other);
    check('the fetch from the site succeeded', fetched.same === 'ok', fetched.same);
    check(
      'no request for a resource has Upgrade-Insecure-Requests',
      [... site.requests, ... other.requests]
      .filter(request => /^\/(?:api|font|image)/.test(request.path))
      .every(request => ! request.upgrade)
    );
    // Visit a page of the site that redirects to its second host.
    clear();
    console.log = () => {};
    page = await visit(browserID, `${site.origin}/redirect`, true);
    await page.waitForTimeout(500);
    await browserClose(page);
    console.log = log;
    check(
      'a redirected navigation identifies the scanner to the host it lands on',
      second.requests.some(request => request.path === '/landed' && request.scanner === scannerId)
    );
    check(
      'a request by the page it lands on identifies the scanner',
      second.requests.some(request => request.path === '/api?landed' && request.scanner === scannerId)
    );
    // Visit the site without a scanner identity.
    clear();
    console.log = () => {};
    page = await visit(browserID, `${site.origin}/`, false);
    await page.waitForTimeout(500);
    await browserClose(page);
    console.log = log;
    check(
      'without a scanner identity no request identifies a scanner',
      [... site.requests, ... other.requests].every(request => ! request.scanner)
    );
    check(
      'without a scanner identity the other party got no preflight request either',
      other.requests.every(request => request.method !== 'OPTIONS')
    );
  }
  catch(error) {
    console.log = log;
    check('the validation ran', false, error.message.split('\n')[0]);
  }
  finally {
    Object.values(servers).forEach(({server}) => server.close());
  }
  return failureCount;
};
// Validates the headers in each browser type.
const validateAll = async () => {
  let failureCount = 0;
  for (const browserID of browserIDs) {
    failureCount += await validate(browserID);
  }
  console.log(failureCount ? `${failureCount} header validation failures` : 'Header validation succeeded');
  // Flush the standard output and then exit, because lingering browser processes otherwise keep the event loop alive.
  process.stdout.write('', () => process.exit(failureCount ? 1 : 0));
};

// OPERATION

validateAll();
