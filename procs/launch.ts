/*
  © 2021–2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {
  Browser, BrowserContext, BrowserContextOptions, LaunchOptions as BrowserLaunchOptions, Page
} from 'playwright';
import {addError} from './error';
import * as fs from 'fs';
import * as path from 'path';
const {posix: posixPath} = require('path') as typeof import('path');
const headedBrowser = process.env.HEADED_BROWSER === 'true';
// Two flavors of Playwright:
// - `playwrightCore`: the upstream Playwright SDK with no plugins attached.
// - `playwrightExtra`: the playwright-extra wrapper. `run.js` registers
//   puppeteer-extra-plugin-stealth on its `chromium` only (the plugin is
//   Chromium-specific by design — see comment in run.js).
// At launch time we pick the flavor per call: Chromium with stealth enabled
// goes through playwright-extra, every other case (Chromium with stealth
// disabled, WebKit, Firefox) goes through plain Playwright.
import playwrightCore = require('playwright');
import playwrightExtra = require('playwright-extra');
import {isBrowserID, isDeviceID, isURL, isValidJob} from './job';
// The in-page script defining window.getXPath.
import {getXPathSource} from './xPathScript';
// Deployment options (navigation, scanner identity, pre-scan scroll, outbound proxy).
import {getNavigation, getProxyLaunchOptions, getScannerId, getScroll, waitStates} from './config';
import type {WaitState} from './config';
import type {XPathNeed} from './testAct';
import type {Act, BrowserID, Report} from '../types';

/*
  launch
  Creates a browser, context, and page, navigates, and acts. Compiled to launch.js by tsc (issue
  #73); edit this file, not the emitted one. Functions passed to page.evaluate or addInitScript,
  and installAccessibleName, whose source is sent to the page, run in the page: they must refer
  to nothing outside themselves, and they are typed only through Playwright's argument types,
  the Window declarations of types.ts, and erasable casts, so that their text is unchanged.
*/

// TYPES

// The result of a navigation by goTo: success, or failure with the reason.
export interface NavResult {
  success: boolean;
  error?: string;
  rejectionData?: Record<string, unknown>;
}
// The options of launch.
export interface LaunchOptions {
  report?: Report;
  // The index of the act the launch serves, or null for a launch serving no act (the catalog).
  actIndex?: number | null;
  tempBrowserID?: BrowserID | '';
  tempURL?: string;
  headEmulation?: 'low' | 'high';
  xPathNeed?: XPathNeed;
  needsAccessibleName?: boolean;
  retries?: number;
  signal?: AbortSignal;
  // Extra Playwright context options (e.g. deviceScaleFactor), spread last over the defaults.
  contextOverrides?: BrowserContextOptions;
  // Whether a test-act launch replays the active checkpoint's acts.
  replay?: boolean;
  // A hook to prepare the page before replaying checkpoint interactions.
  beforeReplay?: (page: Page) => void | Promise<void>;
  // Whether a launch failure is recorded on the act and job (default true). A concurrent rule
  // passes false, because its own launch failure is the rule's alone.
  reportFailure?: boolean;
  // Whether the launch owns a browser rather than using or replacing the job's shared browser.
  independentBrowser?: boolean;
}
// The options of launchOnce.
interface LaunchOnceOptions extends Omit<LaunchOptions, 'retries' | 'reportFailure'> {
  // How far to relax the load state waited for, after failures.
  relaxWait?: 'no' | 'partly' | 'fully';
  // Passed by launch but not read.
  priorTries?: boolean;
}
// The result of launchOnce.
interface LaunchResult {
  success: boolean;
  error?: string;
  page?: Page;
}

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
export const wait = (ms: number, signal?: AbortSignal): Promise<string> => {
  return new Promise(resolve => {
    if (signal?.aborted) {
      resolve('');
      return;
    }
    let timer: NodeJS.Timeout | undefined;
    const onAbort = () => {
      clearTimeout(timer);
      signal!.removeEventListener('abort', onAbort);
      resolve('');
    };
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve('');
    }, ms);
    signal?.addEventListener('abort', onAbort, {once: true});
  });
};
// Removes any trailing slashes from a URL, for redirection comparison.
const deSlash = (url: string | undefined) => (url || '').replace(/\/+$/, '');
// Close a browser context and/or its browser, if they exist.
// Grace period for browser-close operations. Chromium can acknowledge a page
// close without performing it when the close races a navigation commit
// (https://issues.chromium.org/issues/536385539, observed on pages that
// navigate via meta refresh during testing); the close promise then never
// settles — it neither resolves nor rejects — so an unguarded await would
// hang the act forever. Errors are discarded, as before.
const CLOSE_GRACE_MS = 10000;
const settleWithin = (promise: Promise<unknown>) => Promise.race([
  promise.catch(error => {}),
  new Promise(resolve => {
    const timer = setTimeout(resolve, CLOSE_GRACE_MS);
    // Do not keep the process alive for an abandoned close.
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
  })
]);
// Returns the origin of a URL, or an empty string if it has none.
const getOrigin = (url: string) => {
  try {
    const {origin} = new URL(url);
    return origin === 'null' ? '' : origin;
  }
  catch {
    return '';
  }
};
/*
  Makes the pages of a browser context identify the scanner to the site being tested, with an
  X-YRA-Scanner request header.

  The header cannot be an extra HTTP header of the context, which Playwright adds to every
  request. On a request to another origin made in CORS mode (a web font, a fetch or
  XMLHttpRequest call, a module script, a link or script with a crossorigin attribute), a
  header that is not CORS-safelisted obliges the browser to ask the server's permission first,
  in a preflight request. Servers that have never heard of the header refuse, and the browser
  blocks the request, so the page would be tested without its fonts and with its calls to
  other origins failing (issue #205).

  So the header is added only to requests that reach the site being tested and that can cause
  no preflight:
  - a navigation of the page, with its redirects;
  - a navigation of a frame to the origin of the page;
  - a request to the origin of the page by a document of that origin.

  This requires routing every request of the context through this process, which costs a
  little time per request and disables the browser's HTTP cache. It is done only when a
  scanner identity is configured.
*/
const identifyScanner = async (browserContext: BrowserContext, scannerId: string) => {
  await browserContext.route('**/*', async (route, request) => {
    let isIdentifiable = false;
    try {
      const frame = request.frame();
      const mainFrame = frame.page().mainFrame();
      const pageOrigin = getOrigin(mainFrame.url());
      const requestOrigin = getOrigin(request.url());
      // If the request is a navigation:
      if (request.isNavigationRequest()) {
        // Identify the scanner if the page is navigating or a frame is navigating to its origin.
        isIdentifiable = frame === mainFrame || Boolean(requestOrigin) && requestOrigin === pageOrigin;
      }
      // Otherwise, i.e. if it is a request for a resource:
      else {
        // Identify the scanner if a document of the origin of the page is requesting from it.
        isIdentifiable = Boolean(requestOrigin)
        && requestOrigin === pageOrigin
        && requestOrigin === getOrigin(frame.url());
      }
    }
    // If the request has no frame (a request by a service worker) or the page has closed:
    catch {
      // Do not identify the scanner.
    }
    // Let the request proceed, with the header if applicable. The page may close meanwhile.
    await route.continue(
      isIdentifiable ? {headers: {...request.headers(), 'X-YRA-Scanner': scannerId}} : {}
    ).catch(() => {});
  });
};
/*
  The browser shared by the launches of a job under browser or page isolation, if any. When set,
  launchOnce creates contexts in it instead of launching browsers, and browserClose closes only
  the context of a page it owns. The job closes it with closeSharedBrowser at its end.
*/
let sharedBrowser: Browser | null = null;
let sharedBrowserID: BrowserID | '' = '';
export const setSharedBrowser = (browser: Browser | null, browserID: BrowserID | '') => {
  sharedBrowser = browser;
  sharedBrowserID = browserID;
};
export const getSharedBrowser = () => sharedBrowser;
export const closeSharedBrowser = async () => {
  if (sharedBrowser) {
    const browser = sharedBrowser;
    sharedBrowser = null;
    sharedBrowserID = '';
    await settleWithin(browser.close());
  }
};
export const browserClose = async (page: Page | null | undefined) => {
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
const normalizeURL = (url: string | undefined) => {
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
// Visits a URL and returns whether the visit succeeded and, if not, why not.
export const goTo = async (
  report: Report, page: Page, url: string, timeout: number, waitUntil: WaitState
): Promise<NavResult> => {
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
    report.jobData!.visitLatency! += Math.round((Date.now() - startTime) / 1000);
    const httpStatus = response!.status();
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
      else if ([urlNorm, title].some(identifier => identifier!.includes('captcha'))) {
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
          success: true
        };
      }
    }
    // Otherwise, if the response status was prohibition:
    else if (httpStatus === 403) {
      // Log this.
      console.log(`ERROR: Visit to ${url} prohibited (status 403)`);
      // Collect diagnostic data from the response.
      let rejectionData: Record<string, unknown> = {status: 403};
      try {
        const headers = await response!.allHeaders();
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
      const retryHeader = response!.headers()['retry-after'];
      let waitSeconds = 5;
      if (retryHeader) {
        waitSeconds = Number.isNaN(Number(retryHeader))
          ? Math.ceil((new Date(retryHeader) as unknown as number - (new Date() as unknown as number)) / 1000)
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
      report.jobData!.visitRejectionCount!++;
      return {
        success: false,
        error: `ERROR: Visit to ${url} got status ${httpStatus}`
      };
    }
  }
  catch(error) {
    if (debug) {
      console.log(`ERROR visiting ${url} (${(error as Error).message.slice(0, 200)})`);
    }
    return {
      success: false,
      error: `ERROR visiting ${url} (${(error as Error).message.slice(0, 200)})`
    };
  }
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
export const preparePage = async (
  page: Page,
  {xPathNeed = 'script', needsAccessibleName = false}: Pick<LaunchOptions, 'xPathNeed' | 'needsAccessibleName'> = {}
) => {
  if (xPathNeed !== 'none') {
    await page.evaluate(getXPathSource);
  }
  if (xPathNeed === 'attribute') {
    await page.evaluate(() => {
      document.querySelectorAll('*').forEach(element => {
        element.setAttribute('data-xpath', window.getXPath(element) as string);
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
const launchOnce = async (opts: LaunchOnceOptions): Promise<LaunchResult> => {
  // Get the arguments.
  const {
    relaxWait = 'no',// no, partly, fully
    report = {} as Report,
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
    replay = true,
    // An optional hook to prepare the page before replaying checkpoint interactions.
    beforeReplay,
    // Whether this launch owns a browser and must not use or replace the job's shared browser.
    independentBrowser = false,
    signal
  } = opts;
  const act: Act = report.acts[actIndex as number] ?? {} as Act;
  const {device} = report;
  const deviceID = device?.id;
  const browserID = tempBrowserID || report.browserID || '';
  const url = normalizeURL(tempURL || report.target?.url || '');
  let page: Page | undefined;
  let browser: Browser | undefined, browserContext: BrowserContext | undefined;
  let closedPage: Page | undefined, closedContext: BrowserContext | undefined, closedBrowser: Browser | undefined;
  let cleanupPromise = Promise.resolve();
  const cleanupResources = () => {
    cleanupPromise = cleanupPromise.catch(() => {}).then(async () => {
      if (page && page !== closedPage) {
        await browserClose(page);
        closedPage = page;
        closedContext = browserContext;
        if (browser !== sharedBrowser) {
          closedBrowser = browser;
        }
      }
      else {
        if (browserContext && browserContext !== closedContext) {
          await settleWithin(browserContext.close());
          closedContext = browserContext;
        }
        if (browser && browser !== sharedBrowser && browser !== closedBrowser) {
          await settleWithin(browser.close());
          closedBrowser = browser;
        }
      }
    });
    return cleanupPromise;
  };
  const onAbort = () => {
    cleanupResources().catch(() => {});
  };
  // If the specified browser and device types and URL are valid:
  if (isBrowserID(browserID) && isDeviceID(deviceID) && isURL(url)) {
    // Unless the launch is for a test act, whose target applies only to that act, replace the report target URL with the specified URL.
    if (act.type !== 'test') {
      report.target!.url = url!;
    }
    // Resolve whether to run with stealth evasions. Defaults to true (the
    // historical behavior). `report.stealth === false` opts out — useful
    // for sites whose anti-bot heuristics react badly to stealth's patches,
    // or when reproducing a real user agent's exact JS environment matters.
    // Stealth only ever applies to Chromium; WebKit and Firefox always use
    // plain Playwright regardless of the `stealth` field.
    const useStealth = browserID === 'chromium' && report.stealth !== false;
    const playwright = useStealth ? playwrightExtra : playwrightCore;
    // Create a browser of the specified or default type.
    const browserType = playwright[browserID as BrowserID];
    // Define the browser-option args, depending on the browser type and head-emulation level.
    const browserOptionArgs: string[] = [];
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
    const browserOptions: BrowserLaunchOptions = {
      logger: {
        isEnabled: () => false,
        log: (name, severity, message) => {
          if (['warning', 'error'].includes(severity)) {
            console.log(`${severity.toUpperCase()}: ${(message as string).slice(0, 200)}`);
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
    // Route the browser through the outbound proxy, if one is configured.
    const {args: proxyArgs = [], ...proxyOptions} = getProxyLaunchOptions(browserID);
    browserOptionArgs.push(...proxyArgs);
    Object.assign(browserOptions, proxyOptions);
    // If the job specifies a branded Chromium channel (chrome or msedge), run that installed
    // browser instead of the bundled Chromium build; bundled or absent keeps the default.
    const {browserChannel} = report;
    if (browserID === 'chromium' && browserChannel && browserChannel !== 'bundled') {
      browserOptions.channel = browserChannel;
    }
    signal?.addEventListener('abort', onAbort, {once: true});
    try {
      if (signal?.aborted) {
        throw new Error('Aborted');
      }
      // Unless the launch owns its browser, use the job's shared browser if it exists and is of
      // the specified type; otherwise create a browser and share it if the job shares browsers.
      if (
        ! independentBrowser && sharedBrowser && sharedBrowserID === browserID
        && sharedBrowser.isConnected()
      ) {
        browser = sharedBrowser;
      }
      else {
        browser = await browserType.launch(browserOptions);
        if (! independentBrowser && report.jobData?.isolation && report.jobData.isolation !== 'process') {
          if (sharedBrowser) {
            await settleWithin(sharedBrowser.close());
          }
          sharedBrowser = browser;
          sharedBrowserID = browserID;
        }
      }
      if (signal?.aborted) {
        throw new Error('Aborted');
      }
      // Create a context (i.e. window) for it.
      // The device was validated (isValidJob), and its windowOptions are Playwright context options.
      const contextOptions: BrowserContextOptions = {
        ...device!.windowOptions,
        userAgent: (device!.windowOptions as BrowserContextOptions).userAgent
          || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36',
        viewport: (device!.windowOptions as BrowserContextOptions).viewport || {width: 1920, height: 1080},
        locale: 'en-US',
        timezoneId: 'America/Los_Angeles',
        extraHTTPHeaders: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1'
          /*
            No header here may be one that is not CORS-safelisted: Playwright adds these to
            every request, and such a header makes every cross-origin CORS request of the page
            fail its preflight (issue #205). Upgrade-Insecure-Requests was one; browsers send it
            themselves on navigations. The scanner identity is another; see identifyScanner.
          */
        },
        // Caller-specified context options (see contextOverrides above).
        ...contextOverrides
      };
      browserContext = await browser.newContext(contextOptions);
      if (signal?.aborted) {
        throw new Error('Aborted');
      }
      // Prevent default timeouts.
      browserContext.setDefaultTimeout(0);
      // If a scanner identity is configured (job scannerId or SCANNER_ID):
      const scannerId = getScannerId(report);
      if (scannerId) {
        // Make the pages of the context identify the scanner to the site being tested.
        await identifyScanner(browserContext, scannerId);
      }
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
          jobData.errorLogCount!++;
          console.log('Page crashed');
        });
        page.on('pageerror', () => {
          jobData.errorLogCount!++;
        });
        page.on('requestfailed', () => {
          jobData.errorLogCount!++;
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
          jobData.logCount!++;
          jobData.logSize! += msgLength;
          if (errorWords.some(word => msgTextLC.includes(word))) {
            jobData.errorLogCount!++;
            jobData.errorLogSize! += msgLength;
          }
          const msgLC = msgText.toLowerCase();
          if (
            msgText.includes('403') && (msgLC.includes('status')
            || msgLC.includes('prohibited'))
          ) {
            jobData.prohibitedCount!++;
          }
        });
      });
      // Create a page (tab) of the context (window).
      page = await browserContext.newPage();
      if (signal?.aborted) {
        throw new Error('Aborted');
      }
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
      const navResult = await goTo(report, page, url!, navigation.timeout, waitUntil);
      if (signal?.aborted) {
        throw new Error('Aborted');
      }
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
            console.log(`ERROR: Pre-scan scroll failed (${(error as Error).message})`);
          }
        }
        // If the launch is for a test act at a checkpoint reached by interaction:
        const checkpoint = report.checkpoints?.[report.activeCheckpoint as number];
        if (checkpoint && checkpoint.kind === 'interaction' && replay) {
          if (beforeReplay) {
            await beforeReplay(page);
          }
          // Re-enact the acts that reached the checkpoint, before any XPath stamping, so that
          // elements the acts reveal or create are stamped like the rest. A failure closes
          // the page and reports the act, so launch() can retry or give up.
          // Required here, not imported: actDo requires this module (issue #73, hazard 2).
          const {replayActs} = require('./actDo') as typeof import('./actDo');
          const {getDomDigest} = require('./checkpoint') as typeof import('./checkpoint');
          const replayResult = await replayActs(page, report, checkpoint);
          page = replayResult.page;
          const digest = await getDomDigest(page);
          act.data ??= {};
          /*
            A job may give a test act a primitive data property, which job validation does not
            reject. Before this file was strict (issue #73), assigning to a property of it was
            silently ignored; the typeof test keeps that behavior.
          */
          if (['object', 'function'].includes(typeof act.data)) act.data.replay = {
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
              element.setAttribute('data-xpath', window.getXPath(element) as string);
            });
          });
        }
        // If the launch was for an act:
        if (act) {
          // Add the actual URL to the act.
          act.actualURL = page.url();
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
      signal?.removeEventListener('abort', onAbort);
      // Close any browser resources created by this launch.
      await cleanupResources();
      // Return the error.
      return {
        success: false,
        error: (error as Error).message
      };
    }
    if (signal?.aborted) {
      await cleanupResources();
      signal.removeEventListener('abort', onAbort);
      return {
        success: false,
        error: 'Aborted'
      };
    }
    signal?.removeEventListener('abort', onAbort);
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
export const launch = async (opts: LaunchOptions = {}): Promise<Page | null> => {
  let {tempBrowserID = '', tempURL = ''} = opts;
  const {
    report = {} as Report,
    actIndex = 0,
    headEmulation = 'high',
    xPathNeed = 'script',
    needsAccessibleName = false,
    retries = 2,
    signal,
    // Extra Playwright context options, passed through to launchOnce.
    contextOverrides = {},
    // Whether a test-act launch replays the active checkpoint's acts (launches for
    // interaction acts and for the catalog pass do not).
    replay = actIndex !== null,
    beforeReplay,
    // Whether a failure of this launch is recorded on the act and, if so configured,
    // the job (addError), and the browser-type fallback may change the job browser.
    // False for a launch that a concurrent rule makes for its own visit: its failure
    // belongs to the rule, not to the act or the job.
    reportFailure = true,
    // Whether this launch owns a browser and must not use or replace the job's shared browser.
    independentBrowser = false
  } = opts;
  // Get whether the launch is for a test act with its own browser type.
  const launchAct = actIndex === null ? null : report.acts?.[actIndex] as Act & {launch?: {browserID?: BrowserID}};
  const actOverridesBrowser = launchAct?.type === 'test' && Boolean(launchAct.launch?.browserID);
  // If the launch is for a test act at a later checkpoint, navigate to that checkpoint's
  // origin: its URL if navigation reached it, else the URL its replayed acts start from.
  const checkpoint = report.checkpoints?.[report.activeCheckpoint as number];
  if (replay && checkpoint && (report.activeCheckpoint as number) > 0) {
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
        replay,
        beforeReplay,
        independentBrowser,
        signal
      }
    );
    if (signal?.aborted) {
      await browserClose(launchResult.page);
      return null;
    }
    // If the launch and navigation succeeded:
    if (launchResult.success) {
      // Return the page.
      return launchResult.page!;
    }
    // Otherwise, i.e. if the launch or navigation failed:
    else {
      const navigation = getNavigation(report);
      // The other browser types, to be tried in turn once retries are exhausted, unless the job or the deployment keeps the browser type that was specified (navigation.rotateBrowsers or NAV_ROTATE_BROWSERS false).
      let unusedBrowserIDs = navigation.rotateBrowsers
        ? ['chromium', 'webkit', 'firefox'].filter(id => id !== tempBrowserID)
        : [];
      let {error} = launchResult as {error: string};
      // A checkpoint replay failure is deterministic: do not retry it.
      let retriesLeft = error.includes('checkpoint replay failed') ? 0 : retries;
      // If configured (job navigation.failFast4xx or NAV_FAIL_FAST_4XX), a 4xx response other
      // than 408 (request timeout) and 429 (rate limited) is a definitive refusal (firewall
      // block, authentication wall): retrying and switching browsers cannot change it and, under
      // the testaro tool's per-rule relaunch, compounds into long hangs. Stop at once.
      const navStatus = Number((/status(\d{3})/.exec(error) || [])[1]);
      if (
        navigation.failFast4xx
        && navStatus >= 400 && navStatus < 500 && navStatus !== 408 && navStatus !== 429
      ) {
        retriesLeft = 0;
        unusedBrowserIDs = [];
      }
      // As long as retries remain, decrement the allowed retry count and:
      while (retriesLeft) {
        if (signal?.aborted) {
          await browserClose(launchResult.page);
          return null;
        }
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
        await wait(1000 * waitSeconds, signal);
        if (signal?.aborted) {
          return null;
        }
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
            replay,
            beforeReplay,
            independentBrowser,
            signal
          }
        );
        if (signal?.aborted) {
          await browserClose(launchResult.page);
          return null;
        }
        // If the launch and navigation succeeded:
        if (launchResult.success) {
          // Return the page.
          return launchResult.page!;
        }
        // Otherwise, i.e. if the launch or navigation failed:
        else {
          error = launchResult.error!;
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
            tempBrowserID = unusedBrowserIDs.shift() as BrowserID;
            // Unless the browser type is a test act's own, which applies only to that act, change the job browser type too.
            if (reportFailure && ! actOverridesBrowser) {
              console.log(`NOTICE: Changing job browser type to ${tempBrowserID}`);
              report.browserID = tempBrowserID as BrowserID;
            }
            else if (actOverridesBrowser) {
              console.log(`NOTICE: Changing browser type of act ${actIndex} to ${tempBrowserID}`);
            }
            else {
              console.log(`NOTICE: Changing browser type to ${tempBrowserID}`);
            }
            // Reset the retries.
            retriesLeft = retries;
          }
        }
      }
      // If the retries were finally exhausted:
      if (! retriesLeft) {
        const message =
          `Launch or navigation failed; retries${navigation.rotateBrowsers ? ' and browser types' : ''} exhausted (${error})`;
        // If the launch serves the act, report this and, if so configured, that the job
        // was aborted; otherwise only log it, so the caller can attribute the failure.
        if (reportFailure) {
          addError(
            true,
            actIndex === null ? true : abortAssertively,
            report,
            actIndex,
            message
          );
        }
        else {
          console.log(`ERROR: ${message}`);
        }
      }
      // Return a failure.
      return null;
    }
  }
  // Otherwise, i.e. if the report is invalid:
  else {
    const message = `ERROR: Job invalid (${jobValidation.error})`;
    // If the launch serves the act, report this and that the job was aborted;
    // otherwise only log it, so the caller can attribute the failure.
    if (reportFailure) {
      addError(
        true,
        true,
        report,
        actIndex,
        message
      );
    }
    else {
      console.log(message);
    }
    // Return a failure.
    return null;
  }
};
