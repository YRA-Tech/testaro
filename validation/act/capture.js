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

  Each output line: {testcaseId, ruleId, expected, engine, prevented,
  instanceCount, outcomeTotals: {failed, cantTell}, asserted: {SC: count},
  review: {SC: count}, ruleIDs: {engineRuleID: count}, ms}
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
  // Resume support: skip (testcase, engine) pairs already in the out file.
  const alreadyCaptured = new Set();
  if (fs.existsSync(outPath)) {
    fs.readFileSync(outPath, 'utf8').split('\n').filter(Boolean).forEach(line => {
      try {
        const row = JSON.parse(line);
        alreadyCaptured.add(`${row.testcaseId}:${row.engine}`);
      }
      catch(error) {}
    });
  }
  console.log(
    `Capturing ${testcases.length} testcases × ${engines.join('+')} → ${outPath}`
    + (alreadyCaptured.size ? ` (resuming; ${alreadyCaptured.size} rows already captured)` : '')
  );
  const out = fs.createWriteStream(outPath, {flags: 'a'});
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
    for (const engine of engines) {
      if (alreadyCaptured.has(`${testcase.testcaseId}:${engine}`)) {
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
        await page.goto(testcase.url, {waitUntil: 'load', timeout: args.urls ? 30000 : 20000});
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
        const report = {
          standard: 'also',
          jobData: scriptNonce ? {lastScriptNonce: scriptNonce} : {},
          catalog: {},
          target: {url: testcase.url},
          acts: [{type: 'test', which: engine}]
        };
        const actReport = await Promise.race([
          require(`../../tests/${engine}`).reporter(page, report, 0, 40),
          new Promise((resolve, reject) => setTimeout(
            () => reject(new Error('reporter timeout')), REPORTER_TIMEOUT_MS
          ))
        ]);
        const {data, result} = actReport;
        row.prevented = !! (data && data.prevented);
        if (row.prevented) {
          row.error = data.error;
        }
        else {
          row.instanceCount = result.standardResult.instances.length;
          row.outcomeTotals = result.standardResult.outcomeTotals;
          row.ruleIDs = ruleIDCounts(result.standardResult);
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
              xPath: (report.catalog[instance.catalogIndex] || {}).pathID || ''
            }));
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
    done++;
    if (done % 25 === 0) {
      console.log(`${done}/${testcases.length}`);
    }
  }
  await browser.close();
  out.end();
  console.log(`Done: ${done} testcases → ${outPath}`);
})();
