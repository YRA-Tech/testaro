/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  score.js
  Track-A scoring: computes a per-engine, per-ACT-rule confusion matrix from a
  capture JSONL (capture.js output).

  Usage:
    node validation/act/score.js --in results/act-....jsonl [--band asserted|review|both]
      [--json out.json]

  Scoring policy (criterion-level comparability layer, v1):
  - An ACT rule's positive criteria are its forConformance WCAG 2.x success
    criteria from the testcase feed. Rules with none (technique/ARIA-only
    rules) are reported separately as unscoreable.
  - An engine FLAGS a testcase when it reports ≥1 finding on any of the rule's
    criteria. Band `asserted` (default) counts definite failures only (standard
    instance outcome `failed`); `review` counts engine-flagged uncertainty
    (outcome `cantTell`); `both` counts either.
  - failed testcases are the positive class; passed + inapplicable are the
    negative class. Sensitivity = TP/(TP+FN); specificity = TN/(TN+FP).
  Known generosities/strictnesses, stated wherever results publish: a finding
  on the right criterion from an unrelated check still counts (generous); a
  real finding reported under a different criterion does not (strict).
*/

// IMPORTS

const fs = require('fs');
const path = require('path');

// FUNCTIONS

const parseArgs = argv => {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, '')] = argv[i + 1];
  }
  return args;
};

const percent = (numerator, denominator) =>
  denominator ? `${(100 * numerator / denominator).toFixed(1)}%` : '—';

// OPERATION

const args = parseArgs(process.argv);
if (! args.in) {
  console.log('Usage: node validation/act/score.js --in <capture.jsonl> [--band asserted|review|both]');
  process.exit(1);
}
const band = args.band || 'asserted';
const rows = fs.readFileSync(args.in, 'utf8')
.split('\n')
.filter(Boolean)
.map(line => JSON.parse(line));

// ACT-rule criterion sets from the cached feed.
const feed = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'cache', 'testcases.json'), 'utf8')
);
const ruleCriteria = {};
const ruleNames = {};
feed.testcases.forEach(testcase => {
  ruleNames[testcase.ruleId] = testcase.ruleName;
  if (! ruleCriteria[testcase.ruleId]) {
    const criteria = Object.entries(testcase.ruleAccessibilityRequirements || {})
    .filter(([key, value]) => /^wcag2\d:/.test(key) && value && value.forConformance)
    .map(([key]) => key.split(':')[1]);
    ruleCriteria[testcase.ruleId] = new Set(criteria);
  }
});

// Whether a capture row flags its testcase under the scoring policy. Rows
// with exact ACT-rule maps (actAsserted/actReview — qualWeb) are scored on
// those; rows scored at the exact level bypass the unscoreable-criteria gate
// since the mapping needs no WCAG SC bridge.
const flags = row => {
  if (row.actAsserted || row.actReview) {
    const buckets = [];
    if (band === 'asserted' || band === 'both') {
      buckets.push(row.actAsserted || {});
    }
    if (band === 'review' || band === 'both') {
      buckets.push(row.actReview || {});
    }
    return buckets.some(bucket => !! bucket[row.ruleId]);
  }
  const criteria = ruleCriteria[row.ruleId];
  if (! criteria || ! criteria.size) {
    return null;
  }
  const buckets = [];
  if (band === 'asserted' || band === 'both') {
    buckets.push(row.asserted || {});
  }
  if (band === 'review' || band === 'both') {
    buckets.push(row.review || {});
  }
  return buckets.some(
    bucket => Object.entries(bucket).some(([criterion, count]) => count && criteria.has(criterion))
  );
};

// Tally per engine × rule.
const tallies = {};
const unscoreable = new Set();
const errored = {};
rows.forEach(row => {
  if (row.prevented) {
    errored[row.engine] = (errored[row.engine] || 0) + 1;
    return;
  }
  const flagged = flags(row);
  if (flagged === null) {
    unscoreable.add(row.ruleId);
    return;
  }
  tallies[row.engine] ??= {};
  const tally = tallies[row.engine][row.ruleId] ??= {TP: 0, FP: 0, TN: 0, FN: 0};
  if (row.expected === 'failed') {
    tally[flagged ? 'TP' : 'FN']++;
  }
  else {
    tally[flagged ? 'FP' : 'TN']++;
  }
});

// Report.
const report = {band, engines: {}};
Object.entries(tallies).forEach(([engine, ruleTallies]) => {
  console.log(`\n## ${engine} (band: ${band})\n`);
  console.log('| ACT rule | Name | TP | FN | FP | TN | Sens | Spec |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
  const totals = {TP: 0, FP: 0, TN: 0, FN: 0};
  const perRule = {};
  Object.entries(ruleTallies)
  .sort(([, a], [, b]) => (b.TP + b.FN) - (a.TP + a.FN))
  .forEach(([ruleId, tally]) => {
    ['TP', 'FP', 'TN', 'FN'].forEach(key => {
      totals[key] += tally[key];
    });
    perRule[ruleId] = {
      ...tally,
      sensitivity: tally.TP + tally.FN ? tally.TP / (tally.TP + tally.FN) : null,
      specificity: tally.TN + tally.FP ? tally.TN / (tally.TN + tally.FP) : null
    };
    // Rows where the engine saw nothing at all and nothing was expected are
    // uninformative for display; keep them in totals and JSON regardless.
    if (tally.TP + tally.FN === 0 && tally.FP === 0) {
      return;
    }
    console.log(
      `| ${ruleId} | ${ruleNames[ruleId].slice(0, 45)} | ${tally.TP} | ${tally.FN} | ${tally.FP} `
      + `| ${tally.TN} | ${percent(tally.TP, tally.TP + tally.FN)} `
      + `| ${percent(tally.TN, tally.TN + tally.FP)} |`
    );
  });
  console.log(
    `| **all** | | ${totals.TP} | ${totals.FN} | ${totals.FP} | ${totals.TN} `
    + `| ${percent(totals.TP, totals.TP + totals.FN)} `
    + `| ${percent(totals.TN, totals.TN + totals.FP)} |`
  );
  report.engines[engine] = {totals, perRule, errored: errored[engine] || 0};
});
if (unscoreable.size) {
  console.log(
    `\nUnscoreable (no forConformance WCAG 2.x SC): ${[...unscoreable].join(', ')}`
  );
}
Object.entries(errored).forEach(([engine, count]) => {
  console.log(`Errored/prevented rows for ${engine}: ${count}`);
});
if (args.json) {
  fs.writeFileSync(args.json, JSON.stringify(report, null, 2));
  console.log(`\nJSON → ${args.json}`);
}
