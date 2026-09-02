/*
  © 2021–2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  launch.js
  Creates a browser, context, and page, navigates, and acts.
*/

// IMPORTS

const {addError} = require('./error');
const fs = require('fs');
const path = require('path');
const {posix: posixPath} = require('path');
const headedBrowser = process.env.HEADED_BROWSER === 'true';
// Two flavors of Playwright:
// - `playwrightCore`: the upstream Playwright SDK with no plugins attached.
// - `playwrightExtra`: the playwright-extra wrapper. `run.js` registers
//   puppeteer-extra-plugin-stealth on its `chromium` only (the plugin is
//   Chromium-specific by design — see comment in run.js).
// At launch time we pick the flavor per call: Chromium with stealth enabled
// goes through playwright-extra, every other case (Chromium with stealth
// disabled, WebKit, Firefox) goes through plain Playwright.
const playwrightCore = require('playwright');
const playwrightExtra = require('playwright-extra');
const {isBrowserID, isDeviceID, isURL, isValidJob} = require('./job');
// The in-page script defining window.getXPath.
const {getXPathSource} = require('./xPathScript');
// Deployment options (navigation, scanner identity, pre-scan scroll).
const {getNavigation, getScannerId, getScroll, waitStates} = require('./config');

// CONSTANTS

// Whether to log page-context log messages.
const debug = process.env.DEBUG === 'true';
// Strings in log messages indicating errors.
const errorWords = [
  'but not used',
  'content security policy',
  'deprecated',
  'error',
  'exception',
  'expected',
  'failed',
  'invalid',
  'missing',
  'non-standard',
  'not supported',
  'refused',
  'requires',
  'sorry',
  'suspicious',
  'unrecognized',
  'violates',
  'warning'
];
// Seconds to wait between actions.
const waits = Number(process.env.WAITS) ?? 0;
const abortAssertively = process.env.ABORT_ASSERTIVELY === 'true';
// Whether to launch Chromium without its sandbox. The sandbox requires
// unprivileged user-namespace cloning, which the default container seccomp
// policies and some hardened hosts prohibit. Setting
// TESTARO_CHROMIUM_NO_SANDBOX=true permits Chromium to run in such
// environments; the alternative is to run the container with a seccomp
// profile that permits user-namespace cloning. Applies only to Chromium;
// WebKit and Firefox have no equivalent option.
const chromiumNoSandbox = process.env.TESTARO_CHROMIUM_NO_SANDBOX === 'true';

// FUNCTIONS

// Waits.
const wait = exports.wait = ms => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve('');
    }, ms);
  });
};
// Removes any trailing slashes from a URL, for redirection comparison.
const deSlash = url => (url || '').replace(/\/+$/, '');
// Close a browser context and/or its browser, if they exist.
// Grace period for browser-close operations. Chromium can acknowledge a page
// close without performing it when the close races a navigation commit
// (https://issues.chromium.org/issues/536385539, observed on pages that
// navigate via meta refresh during testing); the close promise then never
// settles — it neither resolves nor rejects — so an unguarded await would
// hang the act forever. Errors are discarded, as before.
const CLOSE_GRACE_MS = 10000;
const settleWithin = promise => Promise.race([
  promise.catch(error => {}),
  new Promise(resolve => {
    const timer = setTimeout(resolve, CLOSE_GRACE_MS);
    // Do not keep the process alive for an abandoned close.
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  })
]);
/*
  The browser shared by the launches of a job under browser or page isolation, if any. When set,
  launchOnce creates contexts in it instead of launching browsers, and browserClose closes only
  the context of a page it owns. The job closes it with closeSharedBrowser at its end.
*/
let sharedBrowser = null;
let sharedBrowserID = '';
exports.setSharedBrowser = (browser, browserID) => {
  sharedBrowser = browser;
  sharedBrowserID = browserID;
};
exports.getSharedBrowser = () => sharedBrowser;
exports.closeSharedBrowser = async () => {
  if (sharedBrowser) {
    const browser = sharedBrowser;
    sharedBrowser = null;
    sharedBrowserID = '';
    await settleWithin(browser.close());
  }
};
const browserClose = exports.browserClose = async page => {
  if (page) {
    // Get the context (i.e. window) of the page and the browser of the context. These are methods, not properties; referencing them as properties made this function silently fail to close anything, because a function object has no close method and the resulting TypeError was caught and discarded.
    const browserContext = page.context();
    if (browserContext) {
      // The browser is null for a context not owned by a browser, such as a persistent context.
      const browser = browserContext.browser();
      await settleWithin(browserContext.close());
      // Close the browser too, unless the job shares it.
      if (browser && browser !== sharedBrowser) {
        await settleWithin(browser.close());
      }
    }
  }
};
// Normalizes a file URL in case it has the Windows path format.
const normalizeURL = url => {
  // If a URL was provided:
  if (url) {
    // If it is that of a local file:
    if (url.toLowerCase().startsWith('file:')) {
      let path = url.replace(/^file:\/+/i, '');
      path = path.replace(/\\/g, '/');
      // Collapse redundant slashes and resolve . and .. segments, so a URL built
      // with a relative prefix (e.g. .../procs/../target) compares equal to the
      // absolute URL the browser reports.
      path = posixPath.normalize('/' + path).replace(/^\//, '');
      // Return the URL normalized.
      return 'file:///' + path;
    }
    // Otherwise, i.e. if it is not that of a local file:
    else {
      // Return it.
      return url;
    }
  }
  // Otherwise, i.e. if no URL was provided:
  else {
    // Return this.
    return undefined;
  }
};
// Visits a URL and returns the response of the server.
const goTo = exports.goTo = async (report, page, url, timeout, waitUntil) => {
  // If the URL is that of a local file:
  if (url.startsWith('file://')) {
    const filePath = url.replace(/^file:\/+/, '/');
    const projectRoot = path.resolve(__dirname, '..');
    // If the path is not absolute (inside the project or existing on disk), it is relative to
    // the project root (file://validation/…), as job files write it: make it absolute.
    if (! filePath.startsWith(`${projectRoot}/`) && ! fs.existsSync(filePath)) {
      url = `file://${projectRoot}/${filePath.replace(/^\/+/, '')}`;
    }
    else {
      url = `file://${filePath}`;
    }
  }
  // Visit the URL.
  const startTime = Date.now();
  try {
    const response = await page.goto(url, {
      timeout,
      waitUntil
    });
    report.jobData.visitLatency += Math.round((Date.now() - startTime) / 1000);
    const httpStatus = response.status();
    // If the response status was normal or the URL points to a local file:
    if ([200, 304].includes(httpStatus) || url.startsWith('file:')) {
      const actualURL = page.url();
      const actualNorm = actualURL.startsWith('file:') ? normalizeURL(actualURL) : actualURL;
      const urlNorm = url.startsWith('file:') ? normalizeURL(url) : url;
      const title = await page.title();
      // If the browser was redirected in violation of a strictness requirement:
      if (report.strict && deSlash(actualNorm) !== deSlash(urlNorm)) {
        // Return an error.
        console.log(`ERROR: Visit to ${url} redirected to ${actualURL}`);
        return {
          success: false,
          error: 'badRedirection'
        };
      }
      // Otherwise, if the browser was redirected to a CAPTCHA barrier:
      else if ([urlNorm, title].some(identifier => identifier.includes('captcha'))) {
        // Return this.
        console.log(`ERROR: Visit to ${url} redirected to CAPTCHA barrier (${actualURL})`);
        return {
          success: false,
          error: 'captchaBarrier'
        };
      }
      // Otherwise, i.e. if no prohibited redirection occurred:
      else {
        // Press the Escape key to dismiss any modal dialog.
        await page.keyboard.press('Escape');
        // Return the result of the navigation.
        return {
          success: true,
          response
        };
      }
    }
    // Otherwise, if the response status was prohibition:
    else if (httpStatus === 403) {
      // Log this.
      console.log(`ERROR: Visit to ${url} prohibited (status 403)`);
      // Collect diagnostic data from the response.
      let rejectionData = {status: 403};
      try {
        const headers = await response.allHeaders();
        rejectionData.server = headers['server'] || '';
        rejectionData.cfRay = headers['cf-ray'] || '';
        rejectionData.via = headers['via'] || '';
        rejectionData.xAkamai = headers['x-akamai-transformed'] || '';
        rejectionData.xSucuri = headers['x-sucuri-id'] || '';
        rejectionData.xWaf = headers['x-waf-event-info'] || '';
        rejectionData.headers = headers;
      }
      catch {}
      // Return the prohibition and the data.
      return {
        success: false,
        error: 'status403',
        rejectionData
      };
    }
    // Otherwise, if the response status was rejection of excessive requests:
    else if (httpStatus === 429) {
      const retryHeader = response.headers()['retry-after'];
      let waitSeconds = 5;
      if (retryHeader) {
        waitSeconds = Number.isNaN(Number(retryHeader))
          ? Math.ceil((new Date(retryHeader) - new Date()) / 1000)
          : Number(retryHeader);
      }
      // Return this.
      console.log(
        `ERROR: Visit to ${url} rate-limited (status 429); retry after ${waitSeconds} sec.`
      );
      return {
        success: false,
        error: `status429/retryAfterSeconds=${waitSeconds}`
      };
    }
    // Otherwise, if the response status was a suspension:
    else if (httpStatus === 202) {
      // Return this.
      console.log(`ERROR: Visit to ${url} suspended (status 202)`);
      return {
        success: false,
        error: 'status202'
      };
    }
    // Otherwise, i.e. if the response status was otherwise abnormal:
    else {
      // Return an error.
      report.jobData.visitRejectionCount++;
      return {
        success: false,
        error: `ERROR: Visit to ${url} got status ${httpStatus}`
      };
    }
  }
  catch(error) {
    if (debug) {
      console.log(`ERROR visiting ${url} (${error.message.slice(0, 200)})`);
    }
    return {
      success: false,
      error: `ERROR visiting ${url} (${error.message.slice(0, 200)})`
    };
  }
};
// Gets the script nonce from a response.
const getNonce = exports.getNonce = async response => {
  let nonce = '';
  // If the response includes a content security policy:
  const headers = await response.allHeaders();
  const cspWithQuotes = headers && headers['content-security-policy'];
  if (cspWithQuotes) {
    // If it requires scripts to have a nonce:
    const csp = cspWithQuotes.replace(/'/g, '');
    const directives = csp.split(/ *; */).map(directive => directive.split(/ +/));
    const scriptDirective = directives.find(dir => dir[0] === 'script-src');
    if (scriptDirective) {
      const nonceSpec = scriptDirective.find(valPart => valPart.startsWith('nonce-'));
      if (nonceSpec) {
        // Return the nonce.
        nonce = nonceSpec.replace(/^nonce-/, '');
      }
    }
  }
  // Return the nonce, if any.
  return nonce;
};
// Path of the dom-accessibility-api bundle.
const nameComputationPath = require.resolve('../dist/nameComputation.js');
// Defines the accessible-name window methods in the page. Runs inside the page: closure-free.
const installAccessibleName = () => {
  // Add a window method to compute the accessible name of an element.
  window.getAccessibleName = element => {
    const nameIsComputable = element?.nodeType === Node.ELEMENT_NODE
    && typeof window.computeAccessibleName === 'function';
    return nameIsComputable ? window.computeAccessibleName(element) : '';
  };
  // Add a window method to return a standard proto-instance.
  window.getProtoInstance = (
    element, ruleID, what, count = 1, ordinalSeverity, summaryTagName = '', outcome = 'failed'
  ) => {
    // If an element has been specified:
    if (element) {
      // Get its properties.
      return {
        ruleID,
        what,
        count,
        ordinalSeverity,
        outcome,
        pathID: window.getXPath(element)
      };
    }
    // Otherwise, i.e. if no element has been specified, return a summary instance.
    return {
      ruleID,
      what,
      count,
      ordinalSeverity,
      outcome
    };
  };
};
const accessibleNameSource = `(${installAccessibleName.toString()})();`;
// Prepares an already loaded page (the live page of a checkpoint, under page isolation) for a
// tool, as launchOnce prepares a page it creates: XPath script or attributes, and accessible
// names. Evaluates scripts rather than adding script elements, so the DOM is unchanged.
exports.preparePage = async (page, {xPathNeed = 'script', needsAccessibleName = false} = {}) => {
  if (xPathNeed !== 'none') {
    await page.evaluate(getXPathSource);
  }
  if (xPathNeed === 'attribute') {
    await page.evaluate(() => {
      document.querySelectorAll('*').forEach(element => {
        element.setAttribute('data-xpath', window.getXPath(element));
      });
    });
  }
  if (needsAccessibleName) {
    const nameComputationSource = await fs.promises.readFile(nameComputationPath, 'utf8');
    await page.evaluate(nameComputationSource);
    await page.evaluate(accessibleNameSource);
  }
};
// Creates a browser, context, and page; navigates to a URL; and returns the page.
const launchOnce = async opts => {
  // Get the arguments.
  const {
    relaxWait = 'no',// no, partly, fully
    report = {},
    actIndex = 0,
    tempBrowserID = '',
    tempURL = '',
    headEmulation = 'high',// low, high
    xPathNeed = 'script',// own, script, attribute, none
    needsAccessibleName = false,
    // Extra Playwright context options (e.g. deviceScaleFactor for device-pixel page
    // images), spread last so they win over the defaults.
    contextOverrides = {},
    // Whether to replay the active checkpoint's acts after navigating (test-act launches).
    replay = true
  } = opts;
  const act = report.acts[actIndex] ?? {};
  const {device} = report;
  const deviceID = device?.id;
  const browserID = tempBrowserID || report.browserID || '';
  const url = normalizeURL(tempURL || report.target?.url || '');
  let page;
  // If the specified browser and device types and URL are valid:
  if (isBrowserID(browserID) && isDeviceID(deviceID) && isURL(url)) {
    // Replace the report target URL with the specified URL.
    report.target.url = url;
    // Resolve whether to run with stealth evasions. Defaults to true (the
    // historical behavior). `report.stealth === false` opts out — useful
    // for sites whose anti-bot heuristics react badly to stealth's patches,
    // or when reproducing a real user agent's exact JS environment matters.
    // Stealth only ever applies to Chromium; WebKit and Firefox always use
    // plain Playwright regardless of the `stealth` field.
    const useStealth = browserID === 'chromium' && report.stealth !== false;
    const playwright = useStealth ? playwrightExtra : playwrightCore;
    // Create a browser of the specified or default type.
    const browserType = playwright[browserID];
    // Define the browser-option args, depending on the browser type and head-emulation level.
    const browserOptionArgs = [];
    if (browserID === 'chromium') {
      browserOptionArgs.push('--disable-dev-shm-usage');
      // `--disable-blink-features=AutomationControlled` is a stealth-only
      // arg: it hides the automation flag that stealth's other evasions
      // assume is hidden. When stealth is opted out, leave the flag off
      // so the browser presents an honest automation profile.
      if (useStealth) {
        browserOptionArgs.push('--disable-blink-features=AutomationControlled');
      }
      if (headEmulation === 'high') {
        browserOptionArgs.push(
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--force-device-scale-factor=1',
          '--disable-default-apps',
          '--disable-extensions',
          '--disable-sync',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-background-networking',
          '--force-color-profile=srgb',
          '--disable-features=TranslateUI,VizDisplayCompositor',
          '--disable-ipc-flooding-protection',
          '--disable-logging',
          '--disable-permissions-api',
          '--disable-notifications',
          '--disable-popup-blocking'
        );
      }
    }
    // Get the browser options.
    const browserOptions = {
      logger: {
        isEnabled: () => false,
        log: (name, severity, message) => {
          if (['warning', 'error'].includes(severity)) {
            console.log(`${severity.toUpperCase()}: ${message.slice(0, 200)}`);
          }
        }
      },
      headless: ! headedBrowser,
      slowMo: waits || 0,
      args: browserOptionArgs
    };
    // If launching Chromium without its sandbox was specified:
    if (browserID === 'chromium' && chromiumNoSandbox) {
      // Disable the sandbox.
      browserOptions.chromiumSandbox = false;
    }
    // If the job specifies a branded Chromium channel (chrome or msedge), run that installed
    // browser instead of the bundled Chromium build; bundled or absent keeps the default.
    const {browserChannel} = report;
    if (browserID === 'chromium' && browserChannel && browserChannel !== 'bundled') {
      browserOptions.channel = browserChannel;
    }
    let browser, browserContext;
    try {
      // Use the job's shared browser if it exists and is of the specified type; otherwise
      // create a browser of the specified type, and share it if the job shares browsers.
      if (sharedBrowser && sharedBrowserID === browserID && sharedBrowser.isConnected()) {
        browser = sharedBrowser;
      }
      else {
        browser = await browserType.launch(browserOptions);
        if (report.jobData?.isolation && report.jobData.isolation !== 'process') {
          if (sharedBrowser) {
            await settleWithin(sharedBrowser.close());
          }
          sharedBrowser = browser;
          sharedBrowserID = browserID;
        }
      }
      // Create a context (i.e. window) for it.
      const contextOptions = {
        ...device.windowOptions,
        userAgent: device.windowOptions.userAgent
          || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
        viewport: device.windowOptions.viewport || {width: 1920, height: 1080},
        locale: 'en-US',
        timezoneId: 'America/Los_Angeles',
        extraHTTPHeaders: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Upgrade-Insecure-Requests': '1',
          // A stable scanner identity for firewalls, if configured (job scannerId or SCANNER_ID).
          ...(getScannerId(report) ? {'X-YRA-Scanner': getScannerId(report)} : {})
        },
        // Caller-specified context options (see contextOverrides above).
        ...contextOverrides
      };
      browserContext = await browser.newContext(contextOptions);
      // Prevent default timeouts.
      browserContext.setDefaultTimeout(0);
      // When a page (i.e. tab) is added to the browser context (i.e. window):
      browserContext.on('page', async page => {
        // Ensure the report has a jobData property.
        report.jobData ??= {};
        const {jobData} = report;
        jobData.logCount ??= 0;
        jobData.logSize ??= 0;
        jobData.errorLogCount ??= 0;
        // When an error is thrown, increment the count of logging errors.
        page.on('crash', () => {
          jobData.errorLogCount++;
          console.log('Page crashed');
        });
        page.on('pageerror', () => {
          jobData.errorLogCount++;
        });
        page.on('requestfailed', () => {
          jobData.errorLogCount++;
        });
        // When the page emits a message:
        page.on('console', msg => {
          const msgText = msg.text();
          // If debugging is on:
          if (debug) {
            // Log the start of the message on the console.
            console.log(`\n${msgText.slice(0, 3000)}`);
          }
          // Add statistics on the message to the report.
          const msgTextLC = msgText.toLowerCase();
          const msgLength = msgText.length;
          jobData.logCount++;
          jobData.logSize += msgLength;
          if (errorWords.some(word => msgTextLC.includes(word))) {
            jobData.errorLogCount++;
            jobData.errorLogSize += msgLength;
          }
          const msgLC = msgText.toLowerCase();
          if (
            msgText.includes('403') && (msgLC.includes('status')
            || msgLC.includes('prohibited'))
          ) {
            jobData.prohibitedCount++;
          }
        });
      });
      // Create a page (tab) of the context (window).
      page = await browserContext.newPage();
      // Add a script to the page to mask automation detection.
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {get: () => undefined});
        window.chrome = {runtime: {}};
        Object.defineProperty(navigator, 'plugins', {
          get: () => [1, 2, 3, 4, 5]
        });
        Object.defineProperty(navigator, 'languages', {
          get: () => ['en-US', 'en']
        });
      });
      // If an XPath computation script is required:
      if (xPathNeed !== 'none') {
        // Add the shared script to the page to add a window method to get the XPath of an element.
        await page.addInitScript({content: getXPathSource});
      }
      // If an accessible-name computation script is needed:
      if (needsAccessibleName) {
        // Add the dom-accessibility-api script to the page to compute an accessible name.
        await page.addInitScript({path: nameComputationPath});
        // Add the script defining the accessible-name window methods.
        await page.addInitScript({content: accessibleNameSource});
      }
      // Base the wait on the need of the tool, the configured load state (job navigation
      // property or NAV_WAIT_UNTIL; networkidle by default), and the retry history: a partial
      // relaxation steps one load state looser, a full one waits only for domcontentloaded.
      const navigation = getNavigation(report);
      let waitUntil = xPathNeed === 'none' ? 'domcontentloaded' : navigation.waitUntil;
      if (relaxWait === 'partly') {
        waitUntil = waitStates[Math.min(waitStates.indexOf(waitUntil) + 1, waitStates.length - 1)];
      }
      if (relaxWait === 'fully') {
        waitUntil = 'domcontentloaded';
      }
      // Navigate to the specified URL and wait for the stability required by the next action.
      const navResult = await goTo(report, page, url, navigation.timeout, waitUntil);
      // If the navigation succeeded:
      if (navResult.success) {
        // If the job asks for a full-height scroll (job scroll property or PRESCAN_SCROLL), scroll
        // the page in viewport steps so lazily loaded content is present before cataloguing,
        // imaging, and each tool, then return to the top. Bounded in steps so an infinite scroll
        // cannot hang the launch; never throws.
        if (getScroll(report)) {
          try {
            const viewportHeight = (await page.evaluate(() => window.innerHeight)) || 800;
            for (let step = 0, y = 0; step < 25; step++, y += viewportHeight) {
              const atBottom = await page.evaluate(dy => {
                window.scrollTo(0, dy);
                return dy + window.innerHeight >= document.body.scrollHeight;
              }, y);
              await page.waitForTimeout(120);
              if (atBottom) {
                break;
              }
            }
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(250);
          }
          catch(error) {
            console.log(`ERROR: Pre-scan scroll failed (${error.message})`);
          }
        }
        // If the launch is for a test act at a checkpoint reached by interaction:
        const checkpoint = report.checkpoints?.[report.activeCheckpoint];
        if (checkpoint && checkpoint.kind === 'interaction' && replay) {
          // Re-enact the acts that reached the checkpoint, before any XPath stamping, so that
          // elements the acts reveal or create are stamped like the rest. A failure closes
          // the page and reports the act, so launch() can retry or give up.
          const {replayActs} = require('./actDo');
          const {getDomDigest} = require('./checkpoint');
          const replayResult = await replayActs(page, report, checkpoint);
          page = replayResult.page;
          const digest = await getDomDigest(page);
          act.data ??= {};
          act.data.replay = {
            checkpoint: checkpoint.index,
            acts: replayResult.actCount,
            elapsedMs: replayResult.elapsedMs,
            fidelity: checkpoint.domDigest
              ? (digest === checkpoint.domDigest ? 'exact' : 'divergent')
              : 'unknown'
          };
        }
        // If XPath attributes are needed:
        if (xPathNeed === 'attribute') {
          // Use the added script to add them.
          await page.evaluate(() => {
            const elements = document.querySelectorAll('*');
            elements.forEach(element => {
              element.setAttribute('data-xpath', window.getXPath(element));
            });
          });
        }
        // If the launch was for an act:
        if (act) {
          // Add the actual URL to the act.
          act.actualURL = page.url();
          // Get the response of the target server.
          const {response} = navResult;
          // Add the script nonce, if any, to the act.
          const scriptNonce = await getNonce(response);
          if (scriptNonce) {
            report.jobData.lastScriptNonce = scriptNonce;
          }
        }
      }
      // Otherwise, i.e. if the navigation failed:
      else {
        const {rejectionData} = navResult;
        const addendum = rejectionData
          ? ` (rejection data: ${JSON.stringify(rejectionData, null, 2)})`
          : '';
        // Throw an error.
        throw new Error(`Navigation failed: ${navResult.error}${addendum}`);
      }
    }
    // If the browser and page creation and navigation threw an error:
    catch(error) {
      // Close the browser and its context, if they exist.
      await browserClose(page);
      // Return the error.
      return {
        success: false,
        error: error.message
      };
    }
  }
  // Otherwise, i.e. if the specified browser or device type or URL is invalid:
  else {
    // Return this.
    return {
      success: false,
      error: 'Invalid browser, device type, or URL'
    };
  }
  // If the browser and page creation and navigation succeeded, return the page.
  return {
    success: true,
    page
  };
};
// Manages browser launching and navigating and returns a page.
exports.launch = async (opts = {}) => {
  let {tempBrowserID = '', tempURL = ''} = opts;
  const {
    report = {},
    actIndex = 0,
    headEmulation = 'high',
    xPathNeed = 'script',
    needsAccessibleName = false,
    retries = 2,
    // Extra Playwright context options, passed through to launchOnce.
    contextOverrides = {},
    // Whether a test-act launch replays the active checkpoint's acts (launches for
    // interaction acts and for the catalog pass do not).
    replay = actIndex !== null
  } = opts;
  // If the launch is for a test act at a later checkpoint, navigate to that checkpoint's
  // origin: its URL if navigation reached it, else the URL its replayed acts start from.
  const checkpoint = report.checkpoints?.[report.activeCheckpoint];
  if (replay && checkpoint && report.activeCheckpoint > 0) {
    tempURL = checkpoint.kind === 'navigation' ? checkpoint.url : checkpoint.launchURL;
  }
  // If the report is valid:
  const jobValidation = isValidJob(report);
  if (jobValidation.isValid) {
    // Try to launch a browser and navigate to the specified URL.
    let launchResult = await launchOnce(
      {
        relaxWait: 'no',
        priorTries: false,
        report,
        actIndex,
        tempBrowserID,
        tempURL,
        headEmulation,
        xPathNeed,
        needsAccessibleName,
        contextOverrides,
        replay
      }
    );
    // If the launch and navigation succeeded:
    if (launchResult.success) {
      // Return the page.
      return launchResult.page;
    }
    // Otherwise, i.e. if the launch or navigation failed:
    else {
      let unusedBrowserIDs = ['chromium', 'webkit', 'firefox'].filter(id => id !== tempBrowserID);
      let {error} = launchResult;
      // A checkpoint replay failure is deterministic: do not retry it.
      let retriesLeft = error.includes('checkpoint replay failed') ? 0 : retries;
      // If configured (job navigation.failFast4xx or NAV_FAIL_FAST_4XX), a 4xx response other
      // than 408 (request timeout) and 429 (rate limited) is a definitive refusal (firewall
      // block, authentication wall): retrying and switching browsers cannot change it and, under
      // the testaro tool's per-rule relaunch, compounds into long hangs. Stop at once.
      const navStatus = Number((/status(\d{3})/.exec(error) || [])[1]);
      if (
        getNavigation(report).failFast4xx
        && navStatus >= 400 && navStatus < 500 && navStatus !== 408 && navStatus !== 429
      ) {
        retriesLeft = 0;
        unusedBrowserIDs = [];
      }
      // As long as retries remain, decrement the allowed retry count and:
      while (retriesLeft) {
        // Prepare to wait 1 second before a retry.
        let waitSeconds = 1;
        // If the error was a visit failure due to rate limiting:
        if (error.includes('status429/retryAfterSeconds=')) {
          const waitSecondsRequest = Number(error.replace(/^.+=|\)$/g, ''));
          // If the requested wait is less than 10 seconds:
          if (! Number.isNaN(waitSecondsRequest) && waitSecondsRequest < 10) {
            // Change the wait to the requested one.
            waitSeconds = waitSecondsRequest;
          }
        }
        // Report the wait.
        console.log(
          `WARNING: Waiting ${waitSeconds} sec. before retrying (retries left: ${retriesLeft--})`
        );
        // Wait as specified.
        await wait(1000 * waitSeconds);
        // Retry the launch and navigation.
        launchResult = await launchOnce(
          {
            relaxWait: retriesLeft === 0 ? 'fully' : 'partly',
            report,
            actIndex,
            tempBrowserID,
            tempURL,
            headEmulation,
            xPathNeed,
            needsAccessibleName,
            contextOverrides,
            replay
          }
        );
        // If the launch and navigation succeeded:
        if (launchResult.success) {
          // Return the page.
          return launchResult.page;
        }
        // Otherwise, i.e. if the launch or navigation failed:
        else {
          error = launchResult.error;
          // Report this.
          console.log(`WARNING: Retry failed (${error})`);
          // A checkpoint replay failure is deterministic: stop retrying.
          if (error.includes('checkpoint replay failed')) {
            retriesLeft = 0;
            break;
          }
          // If a browser type was specified, retries are exhausted, and browser types are not:
          if (tempBrowserID && unusedBrowserIDs.length && ! retriesLeft) {
            // Change the browser type.
            tempBrowserID = unusedBrowserIDs.shift();
            console.log(`NOTICE: Changing job browser type to ${tempBrowserID}`);
            report.browserID = tempBrowserID;
            // Reset the retries.
            retriesLeft = retries;
          }
        }
      }
      // If the retries were finally exhausted:
      if (! retriesLeft) {
        // Report this and, if so configured, that the job was aborted.
        addError(
          true,
          actIndex === null ? true : abortAssertively,
          report,
          actIndex,
          `Launch or navigation failed; retries and browser types exhausted (${error})`
        );
      }
      // Return a failure.
      return null;
    }
  }
  // Otherwise, i.e. if the report is invalid:
  else {
    // Report this and that the job was aborted.
    addError(
      true,
      true,
      report,
      actIndex,
      `ERROR: Job invalid (${jobValidation.error})`
    );
    // Return a failure.
    return null;
  }
};
