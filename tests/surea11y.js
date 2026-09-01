/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  surea11y
  Implements the SureA11y core engine (https://github.com/SureA11y/core) WCAG ruleset.

  Upstream publishes a self-contained standalone browser bundle, vendored verbatim at
  ../surea11y/surea11y.browser.js (MPL-2.0), exposing an `a11ycore` global with
  `runa11yCoreInPage(pageUrl, contextSelector, engineOptions, runOnly)`. See
  ../surea11y/README.md for the pinned version and verified result shape.

  Instance policy (engine-candidacy-pipeline.md, Stage 1): `fail`-tier occurrences become
  instances with outcome `failed` at ordinalSeverity 2-3; automatic-rule `cantTell`-tier
  occurrences become instances with outcome `cantTell` at 0-1 (the engine grades per occurrence
  via `occurrenceOutcome`, which takes precedence over the rule-level outcome), carrying the
  engine's `uncertainty` code and `needed` guidance when it supplies them; `pass` and
  `notApplicable` results and all `type: 'manual'` rules are tallied in `data` only and never
  become instances.
*/

// IMPORTS

const fs = require('fs/promises');
const {getXPathCatalogIndex} = require('../procs/xPath');
// Functions to build standard results.
const {getStandardResult, addInstance, UNCERTAINTY_CODES} = require('../procs/standard');

// CONSTANTS

// Severity weights within a certainty band, mirroring tests/axe.js.
const severityWeights = {
  minor: 0,
  moderate: 0,
  serious: 1,
  critical: 1
};

// FUNCTIONS

// Performs and reports the SureA11y tests.
exports.reporter = async (page, report, actIndex) => {
  // Get the nonce, if any.
  const act = report.acts[actIndex];
  const {jobData} = report;
  const scriptNonce = jobData && jobData.lastScriptNonce;
  // Initialize the act report.
  let data = {};
  const result = {
    nativeResult: {},
    standardResult: {}
  };
  const standard = report.standard !== 'no';
  // If standard results are to be reported:
  if (standard) {
    // Initialize the standard result.
    result.standardResult = getStandardResult();
  }
  // Get the vendored tool bundle.
  let script;
  try {
    script = await fs.readFile(`${__dirname}/../surea11y/surea11y.browser.js`, 'utf8');
  }
  catch(error) {
    data.prevented = true;
    data.error = 'ERROR: surea11y bundle missing (see surea11y/README.md for vendoring instructions)';
    return {data, result};
  }
  // Perform the tests and populate the native result.
  result.nativeResult = await page.evaluate(args => new Promise(async resolve => {
    const {scriptNonce, script} = args;
    // Detect page-CSP blocking of the injection (the violation event is
    // dispatched as a task, so the check below waits a tick).
    let cspBlocked = false;
    document.addEventListener('securitypolicyviolation', event => {
      if ((event.violatedDirective || '').startsWith('script-src')) {
        cspBlocked = true;
      }
    });
    // Add the tool script to the page.
    const toolScript = document.createElement('script');
    if (scriptNonce) {
      toolScript.nonce = scriptNonce;
      console.log(`Added nonce ${scriptNonce} to tool script`);
    }
    toolScript.textContent = script;
    document.body.insertAdjacentElement('beforeend', toolScript);
    // If the bundle failed to define its global:
    if (typeof a11ycore === 'undefined' || typeof a11ycore.runa11yCoreInPage !== 'function') {
      // Let a pending securitypolicyviolation event fire before diagnosing.
      await new Promise(tick => setTimeout(tick, 0));
      // A CSP block is a per-page condition, not a browser fault — report it
      // distinctly (wedge canaries must not match this message).
      resolve({
        prevented: true,
        error: cspBlocked
          ? 'surea11y injection blocked by page CSP (script-src)'
          : `a11ycore global not defined (contentType ${document.contentType}, `
          + `scriptChars ${script.length}, readyState ${document.readyState})`
      });
      return;
    }
    try {
      // Run the engine on the whole page with default options — every loaded
      // rule at the default WCAG 2.2 target, matching the axe and pour
      // adapters' kitchen-sink default; testilo's taxonomy decides per rule
      // what counts downstream. runa11yCoreInPage is synchronous; await
      // tolerates a future promise-returning version.
      const sureReport = await a11ycore.runa11yCoreInPage(location.href, null, {}, null);
      // Dotted WCAG criterion (e.g. 1.4.3) from a rule's normative mappings.
      const criterionOf = meta => {
        const mappings = meta && meta.normativeMappings || [];
        for (const mapping of mappings) {
          const requirement = String(mapping.requirement || '').replace(/^SC\s*/i, '');
          if (/^\d+\.\d+\.\d+$/.test(requirement)) {
            return requirement;
          }
        }
        return '';
      };
      const violations = [];
      const incomplete = [];
      // Tallied-only buckets.
      let passRuleCount = 0;
      let inapplicableRuleCount = 0;
      let manualRuleCount = 0;
      let manualOccurrenceCount = 0;
      // For each atomic rule that ran:
      (sureReport.checksResults || []).forEach(check => {
        const {ruleId, outcome, type, occurrences} = check;
        // Manual rules are advisory by definition: tally only.
        if (type === 'manual') {
          manualRuleCount++;
          manualOccurrenceCount += (occurrences || []).length;
          return;
        }
        if (outcome === 'pass') {
          passRuleCount++;
          return;
        }
        // A notApplicable result may carry one scan-describing occurrence
        // (empty selector) — never an element finding.
        if (outcome === 'notApplicable') {
          inapplicableRuleCount++;
          return;
        }
        // fail or cantTell: convert occurrences to flat findings, honoring
        // per-occurrence grading when the rule tiered its findings.
        (occurrences || []).forEach(occurrence => {
          const tier = occurrence.occurrenceOutcome || outcome;
          const cssPath = occurrence.selector || '';
          let xPath = '';
          try {
            const element = cssPath && document.querySelector(cssPath);
            if (element && typeof window.getXPath === 'function') {
              xPath = window.getXPath(element);
            }
          }
          catch(error) {
            // Unresolvable path: instance falls back to excerpt only.
          }
          // Reason for uncertainty: per occurrence, else per check.
          const uncertainty = occurrence.uncertainty || check.uncertainty || {};
          const finding = {
            ruleID: ruleId || '',
            what: (occurrence.summary || check.title || '').replace(/\s+/g, ' ').trim(),
            wcag: criterionOf(check.meta),
            severity: (check.severity || 'moderate').toLowerCase(),
            uncertainty: tier === 'cantTell' ? (uncertainty.code || '') : '',
            needed: tier === 'cantTell' ? (uncertainty.needed || '') : '',
            html: (occurrence.html || '').slice(0, 500),
            cssPath,
            xPath
          };
          (tier === 'fail' ? violations : incomplete).push(finding);
        });
      });
      resolve({
        engine: sureReport.engine || {},
        violations,
        incomplete,
        passRuleCount,
        inapplicableRuleCount,
        manualRuleCount,
        manualOccurrenceCount
      });
    }
    catch(error) {
      resolve({
        prevented: true,
        error: error.message
      });
    };
  }), {
    scriptNonce,
    script
  });
  const {nativeResult} = result;
  // If the tool ran and rules were selected:
  if (! nativeResult.prevented && act.rules) {
    // Remove results of other rules.
    ['violations', 'incomplete'].forEach(certainty => {
      nativeResult[certainty] = nativeResult[certainty]
      .filter(finding => act.rules.includes(finding.ruleID));
    });
  }
  // If the tool was prevented from running:
  if (nativeResult.prevented) {
    data.prevented = true;
    data.error = nativeResult.error;
  }
  // Otherwise, if a standard result is to be reported:
  else if (standard) {
    const {standardResult} = result;
    // Record the tallied-only bucket sizes.
    data.passRuleCount = nativeResult.passRuleCount;
    data.inapplicableRuleCount = nativeResult.inapplicableRuleCount;
    data.manualRuleCount = nativeResult.manualRuleCount;
    data.manualOccurrenceCount = nativeResult.manualOccurrenceCount;
    // For each certainty band:
    [['incomplete', 0, 'cantTell'], ['violations', 2, 'failed']]
    .forEach(([certainty, baseSeverity, outcome]) => {
      // For each native-result finding:
      nativeResult[certainty].forEach(finding => {
        // Add a standard-result instance, forwarding only a known uncertainty code.
        const {ruleID, what, severity, uncertainty, needed, xPath} = finding;
        addInstance(standardResult, {
          ruleID,
          what,
          ordinalSeverity: baseSeverity + (severityWeights[severity] ?? 0),
          outcome,
          uncertainty: UNCERTAINTY_CODES.includes(uncertainty) ? uncertainty : undefined,
          needed,
          catalogIndex: getXPathCatalogIndex(report, xPath)
        });
      });
    });
  }
  return {
    data,
    result
  };
};
