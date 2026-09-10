/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  capture.js
  Runs tool reporters over a page set and records raw per-page findings to
  JSONL. Two page sources:
  - Default: the W3C ACT-Rules test cases (Track A; score with score.js).
  - --urls <file>: a plain list of URLs, one per line (the Stage-3 real-world
    stress/mapping capture). Rows carry per-instance element paths
    (`instances`) so element-level co-occurrence can be computed downstream.
  Scoring/analysis is separate and cheap, so an expensive capture never has
  to repeat to try a different policy.

  Usage (cwd must be the repository root, for tool assets such as aceconfig):
    node validation/act/capture.js --engines pour,axe [--match regex]
      [--rules id,id] [--max N] [--out path.jsonl]
      [--urls path.txt] [--recycle N]

  First line is a header {header: true, capturedAt, mode, engines,
  engineVersions, testaro, forkCommit, playwright}; scorers skip rows without
  a testcaseId. Each further line: {testcaseId, ruleId, expected, engine,
  prevented, instanceCount, outcomeTotals: {failed, cantTell},
  asserted: {SC: count}, review: {SC: count}, ruleIDs: {engineRuleID: count},
  ruleOutcomes: {engineRuleID: {failed, cantTell}}, ms}
  `asserted` counts definite failures (standard-instance outcome `failed`);
  `review` counts engine-flagged uncertainty (outcome `cantTell`). Criteria
  are dotted WCAG SC numbers, extracted per engine from native results;
  engines without an extractor still record ruleIDs, instanceCount, and
  outcomeTotals. Every standard instance must carry a valid outcome; a row
  whose instances do not is marked as an error (adapter drift).
*/

// IMPORTS

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const {chromium} = require('playwright');
const {OUTCOMES} = require('../../procs/standard');

// CONSTANTS

const TESTCASES_URL = 'https://www.w3.org/WAI/content-assets/wcag-act-rules/testcases.json';
const CACHE_DIR = path.join(__dirname, 'cache');
const RESULTS_DIR = path.join(__dirname, 'results');
// Per-reporter time limit, matching the production limits in procs/doActs.js.
const REPORTER_TIMEOUT_MS = 45000;
/*
  Failures that say nothing about the engine: the fixture host was
  unreachable, or the browser wedged. Such a row is retried in place a few
  times (fixtures are fetched live from w3.org, and a flaky uplink drops for
  seconds at a time) and, if still failing, is recaptured by a later resumed
  run instead of being treated as captured.
*/
const RETRYABLE_ERROR = /ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_NETWORK_CHANGED|ERR_TIMED_OUT|newPage deadline|reporter timeout|has been closed|Protocol error/;
const NETWORK_RETRIES = 3;
const NETWORK_RETRY_DELAY_MS = 15000;
// The testaro tool runs ~45 rules (screenshots, hover, motion) in its own browser.
const TESTARO_TIMEOUT_MS = 180000;

/*
  The testaro tool is not a page-injected reporter: its rules launch and
  navigate their own browser through procs/launch.js and validate the job
  they are given. So it is run through doJob() with a minimal valid job, as
  validation/validateTest.js does, and its test act is read back.
*/
let testaroJobCount = 0;
const testaroJob = url => {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/^\d\d(\d{6})T(\d{4}).*$/, '$1T$2');
  // The id names doJob's temporary directory, so it must be unique across
  // fixtures and across concurrent capture processes.
  testaroJobCount++;
  return {
    id: `${stamp}-act-${process.pid}-${testaroJobCount}`,
    what: 'ACT fixture capture (testaro)',
    strict: false,
    standard: 'also',
    observe: false,
    device: {id: 'default', windowOptions: {reducedMotion: 'no-preference'}},
    browserID: 'chromium',
    timeLimit: 120,
    creationTimeStamp: stamp,
    executionTimeStamp: stamp,
    sendReportTo: '',
    target: {what: 'ACT fixture', url},
    sources: {script: 'act', batch: 'act', mergeID: 'act', requester: ''},
    acts: [{type: 'test', which: 'testaro', withItems: true, stopOnFail: false}]
  };
};

// Mirrors procs/doTestAct.js xPathNeeds for the engines this harness supports.
const XPATH_NEEDS = {
  alfa: 'own',
  aslint: 'own',
  axe: 'attribute',
  ed11y: 'script',
  htmlcs: 'attribute',
  ibm: 'attribute',
  pour: 'script',
  qualWeb: 'attribute',
  surea11y: 'script'
};

// Converts a wcag### tag (axe/pour style) to a dotted criterion.
const tagToCriterion = tag => {
  const digits = tag.slice(4);
  return `${digits[0]}.${digits[1]}.${digits.slice(2)}`;
};

/*
  Per-engine criterion extractors: nativeResult → {asserted, review}, each
  {dottedSC: count}. Engines without one record ruleIDs only; add extractors
  here as engines join Track A.
*/
const criterionExtractors = {
  // Shared by pour and surea11y: both adapters flatten to violations/incomplete
  // arrays of findings carrying a dotted `wcag` criterion.
  pour: nativeResult => {
    const buckets = {asserted: {}, review: {}};
    [['violations', 'asserted'], ['incomplete', 'review']].forEach(([source, target]) => {
      (nativeResult[source] || []).forEach(finding => {
        if (finding.wcag) {
          buckets[target][finding.wcag] = (buckets[target][finding.wcag] || 0) + 1;
        }
      });
    });
    return buckets;
  },
  get surea11y() {
    return this.pour;
  },
  axe: nativeResult => {
    const buckets = {asserted: {}, review: {}};
    const details = nativeResult && nativeResult.details;
    [['violations', 'asserted'], ['incomplete', 'review']].forEach(([source, target]) => {
      ((details && details[source]) || []).forEach(rule => {
        const criteria = (rule.tags || [])
        .filter(tag => /^wcag\d{3,4}$/.test(tag))
        .map(tagToCriterion);
        rule.nodes.forEach(() => {
          criteria.forEach(criterion => {
            buckets[target][criterion] = (buckets[target][criterion] || 0) + 1;
          });
        });
      });
    });
    return buckets;
  },
  /*
    QualWeb runs the ACT rules natively: each act-rules assertion carries the
    exact ACT rule ID in `mapping`, so this extractor also emits actAsserted /
    actReview maps keyed by ACT rule ID — score.js prefers those over the
    criterion layer when present.
  */
  qualWeb: nativeResult => {
    const buckets = {asserted: {}, review: {}, actAsserted: {}, actReview: {}};
    const modules = (nativeResult && nativeResult.modules) || {};
    ['act-rules', 'wcag-techniques', 'best-practices'].forEach(section => {
      const assertions = (modules[section] && modules[section].assertions) || {};
      Object.values(assertions).forEach(assertion => {
        const criteria = ((assertion.metadata && assertion.metadata['success-criteria']) || [])
        .map(criterion => criterion.name);
        const actID = section === 'act-rules' ? assertion.mapping : null;
        (assertion.results || []).forEach(assertionResult => {
          const target = assertionResult.verdict === 'failed' ? 'asserted'
            : assertionResult.verdict === 'warning' ? 'review' : null;
          if (! target) {
            return;
          }
          const count = (assertionResult.elements || []).length || 1;
          criteria.forEach(criterion => {
            buckets[target][criterion] = (buckets[target][criterion] || 0) + count;
          });
          if (actID) {
            const actTarget = target === 'asserted' ? 'actAsserted' : 'actReview';
            buckets[actTarget][actID] = (buckets[actTarget][actID] || 0) + count;
          }
        });
      });
    });
    return buckets;
  }
};

// Per-engine rule-ID counters from the standard result.
const ruleIDCounts = standardResult => {
  const counts = {};
  ((standardResult && standardResult.instances) || []).forEach(instance => {
    counts[instance.ruleID] = (counts[instance.ruleID] || 0) + instance.count;
  });
  return counts;
};

// Per-rule certainty bands: {ruleID: {failed, cantTell}} from instance outcomes.
// Lets a scorer join rules to ACT rule ids without a criterion extractor.
const ruleOutcomeCounts = standardResult => {
  const bands = {};
  ((standardResult && standardResult.instances) || []).forEach(instance => {
    const band = bands[instance.ruleID] ??= {failed: 0, cantTell: 0};
    if (instance.outcome === 'failed' || instance.outcome === 'cantTell') {
      band[instance.outcome] += instance.count || 1;
    }
  });
  return bands;
};

/*
  URL mode: one snapshot row per page, taken after every engine has run,
  holding the DOM context of each element any engine flagged. Element
  identity is the normalized XPath the engines already share, so one
  snapshot serves every engine's instances (including the testaro tool,
  whose own browser is gone by then). Bounded per page and per element.
*/
const SNAPSHOT_MAX_ELEMENTS = 400;
const SNAPSHOT_MAX_HTML = 4000;
// Elements per page for which the (slower) accessibility-tree snapshot is taken.
const SNAPSHOT_MAX_ARIA = 200;
/*
  Snapshot profile version. v1: DOM context (outerHTML, two ancestor shells,
  computed style subset, box, text) plus the accessibility invariant a
  reducer must preserve, captured at source rather than reconstructed: the
  element's own accessibility-tree snapshot (`aria`), the elements its IDREF
  attributes point at (`refs`), and the structural context outside the
  element itself (`context`: ancestor roles, table/list position).
*/
const SNAPSHOT_PROFILE_VERSION = 1;
const IDREF_ATTRIBUTES = [
  'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns', 'aria-activedescendant',
  'aria-flowto', 'aria-details', 'aria-errormessage', 'headers', 'for', 'list', 'form'
];
const snapshotScript = ([xPaths, maxHTML, idrefAttributes]) => {
  const shell = element => {
    const attrs = Array.from(element.attributes)
    .map(attribute => `${attribute.name}="${attribute.value.slice(0, 120)}"`)
    .join(' ');
    return `<${element.tagName.toLowerCase()}${attrs ? ` ${attrs}` : ''}>`;
  };
  const styleKeys = [
    'display', 'visibility', 'opacity', 'position', 'color', 'background-color',
    'font-size', 'font-weight', 'line-height', 'letter-spacing', 'word-spacing', 'outline-style'
  ];
  const snapshots = {};
  for (const xPath of xPaths) {
    try {
      const element = document.evaluate(
        xPath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
      ).singleNodeValue;
      if (! element || element.nodeType !== Node.ELEMENT_NODE) {
        snapshots[xPath] = {missing: true};
        continue;
      }
      const ancestors = [];
      const ancestorRoles = [];
      let parent = element.parentElement;
      while (parent && parent !== document.documentElement) {
        if (ancestors.length < 2) {
          ancestors.unshift(shell(parent));
        }
        const role = parent.getAttribute('role');
        const tag = parent.tagName.toLowerCase();
        if (role || /^(main|nav|header|footer|aside|section|article|form|table|thead|tbody|tr|ul|ol|dl|fieldset|dialog|menu|figure|details)$/.test(tag)) {
          ancestorRoles.unshift(role ? `${tag}[role=${role}]` : tag);
        }
        parent = parent.parentElement;
      }
      // Elements this element points at by IDREF: the part of the invariant that lives outside it.
      const refs = {};
      idrefAttributes.forEach(attribute => {
        const value = element.getAttribute(attribute);
        if (! value) {
          return;
        }
        refs[attribute] = value.trim().split(/\s+/).slice(0, 8).map(id => {
          const target = document.getElementById(id);
          return target
            ? {id, html: target.outerHTML.slice(0, 400), text: (target.textContent || '').trim().slice(0, 120)}
            : {id, missing: true};
        });
      });
      // Structural context: table and list position, and whether the element labels something.
      const context = {ancestorRoles};
      const cell = element.closest('td, th');
      if (cell) {
        const row = cell.parentElement;
        const table = cell.closest('table');
        context.table = {
          row: row ? Array.from(row.parentElement.children).indexOf(row) : -1,
          col: Array.from(row ? row.children : []).indexOf(cell),
          rows: table ? table.rows.length : 0,
          scope: cell.getAttribute('scope') || '',
          headers: cell.getAttribute('headers') || ''
        };
      }
      const item = element.closest('li, option, [role=listitem], [role=option], [role=menuitem], [role=tab], [role=treeitem]');
      if (item && item.parentElement) {
        context.set = {
          index: Array.from(item.parentElement.children).indexOf(item),
          size: item.parentElement.children.length,
          container: shell(item.parentElement)
        };
      }
      if (element.id) {
        const referrers = Array.from(document.querySelectorAll(
          `[aria-labelledby~="${element.id}"], [aria-describedby~="${element.id}"], [headers~="${element.id}"], label[for="${element.id}"]`
        )).slice(0, 8).map(shell);
        if (referrers.length) {
          context.referencedBy = referrers;
        }
      }
      const computed = getComputedStyle(element);
      const style = {};
      styleKeys.forEach(key => {
        style[key] = computed.getPropertyValue(key);
      });
      const rect = element.getBoundingClientRect();
      const outerHTML = element.outerHTML;
      snapshots[xPath] = {
        outerHTML: outerHTML.length > maxHTML ? `${outerHTML.slice(0, maxHTML)} …` : outerHTML,
        truncated: outerHTML.length > maxHTML,
        ancestors,
        style,
        box: [rect.x, rect.y, rect.width, rect.height].map(Math.round),
        text: (element.textContent || '').trim().slice(0, 200),
        refs,
        context
      };
    }
    catch(error) {
      snapshots[xPath] = {error: String(error && error.message || error).slice(0, 120)};
    }
  }
  return snapshots;
};
// Adds each element's accessibility-tree snapshot (role, name, states, children) to its snapshot.
const addAriaSnapshots = async (page, snapshots, xPaths) => {
  for (const xPath of xPaths.slice(0, SNAPSHOT_MAX_ARIA)) {
    const snapshot = snapshots[xPath];
    if (! snapshot || snapshot.missing || snapshot.error) {
      continue;
    }
    try {
      snapshot.aria = await page.locator(`xpath=${xPath}`).first().ariaSnapshot({timeout: 2000});
    }
    catch(error) {
      snapshot.ariaError = String(error && error.message || error).split('\n')[0].slice(0, 120);
    }
  }
};

// Versions of the engines in play, for the capture header row.
const engineVersions = engines => {
  const packages = {
    alfa: '@siteimprove/alfa-rules',
    aslint: 'aslint',
    axe: 'axe-core',
    ed11y: 'editoria11y',
    htmlcs: 'html_codesniffer',
    ibm: 'accessibility-checker',
    qualWeb: '@qualweb/act-rules'
  };
  const versions = {};
  const root = path.join(__dirname, '..', '..');
  engines.forEach(engine => {
    try {
      if (packages[engine]) {
        // Read from disk: some packages' `exports` maps block require() of package.json.
        const packageJSON = path.join(root, 'node_modules', packages[engine], 'package.json');
        versions[engine] = JSON.parse(fs.readFileSync(packageJSON, 'utf8')).version;
      }
      else if (['pour', 'surea11y'].includes(engine)) {
        const readme = fs.readFileSync(path.join(root, engine, 'README.md'), 'utf8');
        const match = readme.match(/\b(\d+\.\d+\.\d+)\b/);
        versions[engine] = match ? match[1] : 'unknown';
      }
      else if (engine === 'testaro') {
        versions[engine] = require('../../package.json').version;
      }
    }
    catch(error) {
      versions[engine] = 'unknown';
    }
  });
  return versions;
};

// FUNCTIONS

// Parses CLI arguments of the form --name value.
const parseArgs = argv => {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, '')] = argv[i + 1];
  }
  return args;
};

// Gets the testcase feed, cached on disk.
const getTestcases = async () => {
  await fsp.mkdir(CACHE_DIR, {recursive: true});
  const cachePath = path.join(CACHE_DIR, 'testcases.json');
  if (! fs.existsSync(cachePath)) {
    const response = await fetch(TESTCASES_URL);
    await fsp.writeFile(cachePath, await response.text());
  }
  return JSON.parse(await fsp.readFile(cachePath, 'utf8')).testcases;
};

// The window.getXPath injection, as in procs/launch.js.
const getXPathScript = () => {
  window.getXPath = element => {
    if (! element || element.nodeType !== Node.ELEMENT_NODE) {
      return '';
    }
    const segments = [];
    while (element && element.nodeType === Node.ELEMENT_NODE) {
      const tag = element.tagName.toLowerCase();
      if (element === document.documentElement) {
        segments.unshift('html');
        break;
      }
      const parent = element.parentNode;
      if (! parent || parent.nodeType !== Node.ELEMENT_NODE) {
        segments.unshift(tag);
        break;
      }
      const cohort = Array.from(parent.childNodes).filter(
        childNode => childNode.nodeType === Node.ELEMENT_NODE
        && childNode.tagName === element.tagName
      );
      const subscript = tag === 'body' ? '' : `[${cohort.indexOf(element) + 1}]`;
      segments.unshift(`${tag}${subscript}`);
      element = parent;
    }
    return `/${segments.join('/')}`;
  };
};

// OPERATION

// A tool's stray promise (e.g. a playwright-extra CDP session settling after
// the page is closed) must not abort a multi-hour capture; the row's own
// try/catch and the browser-replacement heuristics handle the page.
process.on('unhandledRejection', reason => {
  const message = reason && reason.message ? reason.message : String(reason);
  if (/cdpSession|Target page, context or browser has been closed/.test(message)) {
    console.log(`WARNING: unhandled rejection (${message})`);
    return;
  }
  // Anything else is a bug in the harness: fail loudly rather than hang.
  console.error(`ERROR: unhandled rejection (${message})`);
  process.exit(1);
});

(async () => {
  const args = parseArgs(process.argv);
  const engines = (args.engines || 'pour').split(',');
  const outPath = args.out
    || path.join(RESULTS_DIR, `act-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
  await fsp.mkdir(path.dirname(outPath), {recursive: true});
  let testcases;
  if (args.urls) {
    // URL-list mode: one synthetic testcase per line; the URL is the ID.
    testcases = (await fsp.readFile(args.urls, 'utf8'))
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && ! line.startsWith('#'))
    .map(url => ({testcaseId: url, url}));
  }
  else {
    testcases = await getTestcases();
  }
  if (args.rules) {
    const wanted = new Set(args.rules.split(','));
    testcases = testcases.filter(testcase => wanted.has(testcase.ruleId));
  }
  if (args.match) {
    const matcher = new RegExp(args.match, 'i');
    testcases = testcases.filter(testcase => matcher.test(testcase.ruleName));
  }
  if (args.max) {
    testcases = testcases.slice(0, Number(args.max));
  }
  // Resume support: skip (testcase, engine) pairs already in the out file,
  // except rows prevented for a retryable reason — those are recaptured, and
  // a scorer keeps the last row per pair.
  const alreadyCaptured = new Set();
  // URL mode: flagged XPaths from rows captured by earlier runs, so a resumed
  // page still gets its snapshot row (its engine rows are skipped).
  const priorFlagged = new Map();
  if (fs.existsSync(outPath)) {
    fs.readFileSync(outPath, 'utf8').split('\n').filter(Boolean).forEach(line => {
      try {
        const row = JSON.parse(line);
        if (! row.testcaseId) {
          return;
        }
        // Fixture ids are content hashes shared across rules (e.g. the AA and
        // AAA contrast rules), so the rule is part of the identity.
        const key = `${row.ruleId || ''}/${row.testcaseId}:${row.engine}`;
        if (row.prevented && RETRYABLE_ERROR.test(row.error || '')) {
          alreadyCaptured.delete(key);
        }
        else {
          alreadyCaptured.add(key);
        }
        if (Array.isArray(row.instances)) {
          const flagged = priorFlagged.get(row.testcaseId) || new Set();
          row.instances.forEach(instance => {
            if (instance.xPath && instance.outcome === 'failed') {
              flagged.add(instance.xPath);
            }
          });
          priorFlagged.set(row.testcaseId, flagged);
        }
      }
      catch(error) {}
    });
  }
  console.log(
    `Capturing ${testcases.length} testcases × ${engines.join('+')} → ${outPath}`
    + (alreadyCaptured.size ? ` (resuming; ${alreadyCaptured.size} rows already captured)` : '')
  );
  const out = fs.createWriteStream(outPath, {flags: 'a'});
  // Header row (no testcaseId) pinning what produced a fresh capture; scorers
  // skip it, and a resumed capture keeps the original header.
  if (! alreadyCaptured.size) {
    let forkCommit = 'unknown';
    try {
      forkCommit = require('child_process')
      .execFileSync('git', ['rev-parse', 'HEAD'], {cwd: path.join(__dirname, '..', '..'), encoding: 'utf8'})
      .trim();
    }
    catch(error) {}
    out.write(`${JSON.stringify({
      header: true,
      capturedAt: new Date().toISOString(),
      mode: args.urls ? 'urls' : 'act-fixtures',
      engines,
      engineVersions: engineVersions(engines),
      testaro: require('../../package.json').version,
      forkCommit,
      playwright: require('playwright/package.json').version
    })}\n`);
  }
  /*
    The browser is recycled every RECYCLE_EVERY testcases: a 2026-08-22 full
    run showed script-tag injection silently failing (tool global never
    defined) after ~270 testcases in one long-lived browser, while
    evaluate-based injection kept working. Fresh processes reproduce none of
    it, so periodic recycling is the guard.
  */
  const RECYCLE_EVERY = args.recycle === undefined ? 100 : Number(args.recycle);
  let browser = await chromium.launch();
  let context = await browser.newContext();
  let done = 0;
  /*
    Hang guards. page.close() can hang FOREVER (not reject — hang) on a page
    that performed a meta-refresh(0) navigation (reproduced locally,
    playwright 1.62.1, ~50% of rounds on such pages; see isolation-notes.md).
    So: every await that touches the browser is raced against a deadline, and
    if the per-testcase watchdog trips, the browser is presumed wedged and
    replaced (the old one is closed with its own deadline and abandoned if
    that hangs too).
  */
  const withDeadline = (promise, ms, label) => Promise.race([
    promise,
    new Promise((resolve, reject) => setTimeout(
      () => reject(new Error(`${label} deadline ${ms}ms`)), ms
    ))
  ]);
  const replaceBrowser = async () => {
    const oldBrowser = browser;
    withDeadline(oldBrowser.close(), 10000, 'browser.close').catch(() => {});
    browser = await chromium.launch();
    context = await browser.newContext();
  };
  for (const testcase of testcases) {
    if (done > 0 && RECYCLE_EVERY && done % RECYCLE_EVERY === 0) {
      await replaceBrowser();
    }
    // XPaths flagged on this page by any engine, for the URL-mode snapshot row.
    const flaggedXPaths = new Set(priorFlagged.get(testcase.testcaseId) || []);
    for (const engine of engines) {
      if (alreadyCaptured.has(`${testcase.ruleId || ''}/${testcase.testcaseId}:${engine}`)) {
        continue;
      }
      const row = {
        testcaseId: testcase.testcaseId,
        ruleId: testcase.ruleId,
        ruleName: testcase.ruleName,
        expected: testcase.expected,
        engine
      };
      const started = Date.now();
      let page;
      let closeHung = false;
      try {
        page = await withDeadline(context.newPage(), 20000, 'newPage');
        const xPathNeed = XPATH_NEEDS[engine] || 'none';
        if (xPathNeed === 'script' || xPathNeed === 'attribute') {
          await page.addInitScript(getXPathScript);
        }
        // Navigate, waiting out a dropped uplink rather than recording it as a result.
        for (let attempt = 0; ; attempt++) {
          try {
            await page.goto(testcase.url, {waitUntil: 'load', timeout: args.urls ? 30000 : 20000});
            break;
          }
          catch(error) {
            if (attempt < NETWORK_RETRIES && /ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_NETWORK_CHANGED/.test(error.message)) {
              console.log(`WARNING: network error on ${testcase.testcaseId}; retrying in ${NETWORK_RETRY_DELAY_MS / 1000}s`);
              await new Promise(resolve => setTimeout(resolve, NETWORK_RETRY_DELAY_MS));
              continue;
            }
            throw error;
          }
        }
        if (xPathNeed === 'attribute') {
          // Stamp data-xpath attributes, as procs/launch.js does.
          await withDeadline(page.evaluate(() => {
            document.querySelectorAll('*').forEach(element => {
              element.setAttribute('data-xpath', window.getXPath(element));
            });
          }), 15000, 'stamping');
        }
        /*
          Capture the page's script nonce (if its CSP uses one) so
          script-injecting adapters can reuse it — mirroring the production
          launch proc's jobData.lastScriptNonce.
        */
        const scriptNonce = await page.evaluate(() => {
          const nonced = document.querySelector('script[nonce]');
          return (nonced && nonced.nonce) || '';
        }).catch(() => '');
        let report;
        let actReport;
        if (engine === 'testaro') {
          const {doJob} = require('../../run');
          report = await Promise.race([
            doJob(testaroJob(testcase.url)),
            new Promise((resolve, reject) => setTimeout(
              () => reject(new Error('reporter timeout')), TESTARO_TIMEOUT_MS
            ))
          ]);
          actReport = report.jobData && report.jobData.aborted
            ? {data: {prevented: true, error: report.jobData.abortMessage || 'job aborted'}}
            : report.acts.find(jobAct => jobAct.type === 'test')
              || {data: {prevented: true, error: 'no test act in job report'}};
        }
        else {
          report = {
            standard: 'also',
            jobData: scriptNonce ? {lastScriptNonce: scriptNonce} : {},
            catalog: {},
            target: {url: testcase.url},
            acts: [{type: 'test', which: engine, withItems: true}]
          };
          actReport = await Promise.race([
            require(`../../tests/${engine}`).reporter(page, report, 0, 40),
            new Promise((resolve, reject) => setTimeout(
              () => reject(new Error('reporter timeout')), REPORTER_TIMEOUT_MS
            ))
          ]);
        }
        const {data, result} = actReport;
        row.prevented = !! (data && data.prevented);
        if (row.prevented) {
          row.error = data.error;
        }
        else {
          row.instanceCount = result.standardResult.instances.length;
          row.outcomeTotals = result.standardResult.outcomeTotals;
          row.ruleIDs = ruleIDCounts(result.standardResult);
          row.ruleOutcomes = ruleOutcomeCounts(result.standardResult);
          const unoutcomed = result.standardResult.instances
          .filter(instance => ! OUTCOMES.includes(instance.outcome)).length;
          if (unoutcomed) {
            row.error = `${unoutcomed} instance(s) without a valid outcome`;
          }
          const extractor = criterionExtractors[engine];
          if (extractor) {
            Object.assign(row, extractor(result.nativeResult));
          }
          if (args.urls) {
            // Per-instance element paths for element-level co-occurrence
            // (Stage-3b mapping bootstrap). Capped: a pathological page must
            // not blow up the output file.
            row.instances = result.standardResult.instances
            .slice(0, 2000)
            .map(instance => ({
              ruleID: instance.ruleID,
              severity: instance.ordinalSeverity,
              outcome: instance.outcome,
              uncertainty: instance.uncertainty,
              xPath: ((report.catalog || {})[instance.catalogIndex] || {}).pathID || ''
            }));
            row.instances.forEach(instance => {
              if (instance.xPath && instance.outcome === 'failed') {
                flaggedXPaths.add(instance.xPath);
              }
            });
          }
        }
      }
      catch(error) {
        row.prevented = true;
        row.error = error.message.slice(0, 200);
      }
      finally {
        if (page) {
          // close() can hang, not reject, after a meta-refresh navigation —
          // race it and abandon the page if the deadline trips.
          await withDeadline(page.close(), 5000, 'page.close').catch(error => {
            closeHung = error.message.includes('deadline');
          });
        }
      }
      /*
        Replace the browser on any sign of a wedged/dead browser, not just a
        tripped deadline: a wedged browser's newPage first throws "Protocol
        error (Target.createTarget)" and, once the process dies, "Target
        page, context or browser has been closed" (observed 2026-08-22 after
        a bc659a meta-refresh close-hang; a deadline-only trigger let 73
        rows fail before the next scheduled recycle).
      */
      if (
        closeHung
        || (row.error && /deadline|has been closed|Protocol error/.test(row.error))
        /*
          Canary: a script-tag-injecting tool reporting its global undefined
          on an ordinary text/html page means browser-wide script-element
          execution is wedged (the injection cliff — a probabilistic wedge
          that regional replays never reproduce; it once killed 41
          consecutive rows in a browser only ~36 pages old). XML pages are
          excluded: script elements legitimately never execute there.
        */
        || (row.error && /global not defined \(contentType text\/html/.test(row.error))
      ) {
        row.browserReplaced = true;
        await replaceBrowser();
      }
      row.ms = Date.now() - started;
      out.write(`${JSON.stringify(row)}\n`);
    }
    // URL mode: snapshot the flagged elements once per page.
    if (args.urls && flaggedXPaths.size && ! alreadyCaptured.has(`${testcase.ruleId || ''}/${testcase.testcaseId}:_snapshot`)) {
      const snapshotRow = {testcaseId: testcase.testcaseId, engine: '_snapshot', prevented: false};
      const started = Date.now();
      let page;
      try {
        page = await withDeadline(context.newPage(), 20000, 'newPage');
        await page.goto(testcase.url, {waitUntil: 'load', timeout: 30000});
        const xPaths = [...flaggedXPaths].slice(0, SNAPSHOT_MAX_ELEMENTS);
        snapshotRow.snapshots = await withDeadline(
          page.evaluate(snapshotScript, [xPaths, SNAPSHOT_MAX_HTML, IDREF_ATTRIBUTES]), 30000, 'snapshot'
        );
        await withDeadline(addAriaSnapshots(page, snapshotRow.snapshots, xPaths), 120000, 'ariaSnapshot');
        snapshotRow.profileVersion = SNAPSHOT_PROFILE_VERSION;
        snapshotRow.flaggedCount = flaggedXPaths.size;
        snapshotRow.capped = flaggedXPaths.size > SNAPSHOT_MAX_ELEMENTS;
      }
      catch(error) {
        snapshotRow.prevented = true;
        snapshotRow.error = error.message.slice(0, 200);
      }
      finally {
        if (page) {
          await withDeadline(page.close(), 5000, 'page.close').catch(() => {});
        }
      }
      snapshotRow.ms = Date.now() - started;
      out.write(`${JSON.stringify(snapshotRow)}\n`);
    }
    done++;
    if (done % 25 === 0) {
      console.log(`${done}/${testcases.length}`);
    }
  }
  await browser.close();
  out.end();
  console.log(`Done: ${done} testcases → ${outPath}`);
})();
