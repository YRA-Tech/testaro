// Playwright-free reproduction attempt: raw CDP over WebSocket (Node's
// native WebSocket client). Question: does Chromium's Target.closeTarget
// return {success:true} WITHOUT closing (no Target.targetDestroyed, target
// still listed) when the close races a meta-refresh navigation commit?
// If yes → browser-side contract violation, independent of Playwright.
const http = require('http');
const {spawn} = require('child_process');
// Any Chromium binary works; defaults to Playwright's bundled one.
const {chromium} = require('playwright');
const CHROME = process.env.CHROME_PATH || chromium.executablePath();

const pages = {
  '/a.html': `<!DOCTYPE html><html lang="en"><head><title>a</title>
    <meta http-equiv="refresh" content="0; URL='/target.html'"></head>
    <body><p>redirecting</p></body></html>`,
  '/target.html': `<!DOCTYPE html><html lang="en"><head><title>t</title></head>
    <body><p>arrived</p></body></html>`
};

(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    res.end(pages[req.url] || pages['/target.html']);
  });
  await new Promise(resolve => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  // Launch the same Chromium binary Playwright uses, but bare.
  const chrome = spawn(CHROME, [
    '--headless=new', '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    '--user-data-dir=/tmp/cdp-repro-profile'
  ]);
  const wsURL = await new Promise((resolve, reject) => {
    let stderr = '';
    chrome.stderr.on('data', chunk => {
      stderr += chunk;
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)/);
      if (match) resolve(match[1]);
    });
    setTimeout(() => reject(new Error('no DevTools ws URL')), 15000);
  });

  const ws = new WebSocket(wsURL);
  await new Promise(resolve => ws.onopen = resolve);
  let nextId = 1;
  const pending = new Map();
  const events = [];
  ws.onmessage = messageEvent => {
    const message = JSON.parse(messageEvent.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
    else if (message.method) {
      events.push(message);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise(resolve => {
    const id = nextId++;
    pending.set(id, resolve);
    ws.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
  });
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  await send('Target.setDiscoverTargets', {discover: true});
  let contractViolations = 0;
  const ROUNDS = 10;
  for (let round = 0; round < ROUNDS; round++) {
    const {result: {targetId}} = await send('Target.createTarget', {url: 'about:blank'});
    const {result: {sessionId}} = await send('Target.attachToTarget', {targetId, flatten: true});
    await send('Page.enable', {}, sessionId);
    await send('Runtime.enable', {}, sessionId);
    await send('Page.navigate', {url: `${base}/a.html`}, sessionId);
    // Leave an evaluate in flight for the refresh navigation to destroy
    // (mirrors the real-world trigger), then close during the commit window.
    send('Runtime.evaluate', {
      expression: 'new Promise(r => setTimeout(r, 100))',
      awaitPromise: true
    }, sessionId);
    await wait(30 + (round % 5) * 15);
    events.length = 0;
    const closeReply = await send('Target.closeTarget', {targetId});
    const success = closeReply.result && closeReply.result.success;
    await wait(3000);
    const destroyed = events.some(
      e => e.method === 'Target.targetDestroyed' && e.params.targetId === targetId
    );
    const {result: {targetInfos}} = await send('Target.getTargets');
    const stillListed = targetInfos.some(t => t.targetId === targetId);
    const verdict = success && ! destroyed && stillListed ? 'CONTRACT VIOLATION'
      : success && destroyed ? 'closed properly'
        : `other (success=${success} destroyed=${destroyed} listed=${stillListed})`;
    console.log(`round ${round}: closeTarget success=${success}, targetDestroyed=${destroyed}, stillListed=${stillListed} → ${verdict}`);
    if (verdict === 'CONTRACT VIOLATION') {
      contractViolations++;
      // Clean up the orphan so rounds stay independent.
      await send('Target.closeTarget', {targetId});
      await wait(500);
    }
  }
  console.log(`${contractViolations}/${ROUNDS} rounds: success:true with target neither destroyed nor removed`);
  chrome.kill();
  server.close();
  process.exit(0);
})();
