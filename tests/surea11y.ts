/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import * as fs from 'fs/promises';
import type {Page} from 'playwright';
import {getXPathCatalogIndex} from '../procs/xPath';
import {getStandardResult, addInstance, UNCERTAINTY_CODES} from '../procs/standard';
import type {Act, Outcome, Report, StandardResult} from '../types';

// TYPES

// The surea11y-act properties this reporter consumes.
interface SureAct extends Act {
  rules?: string[];
}
// A surea11y severity (axe-style impact).
type SureSeverity = 'minor' | 'moderate' | 'serious' | 'critical';
// One element finding, flattened from the engine's per-check results.
interface SureFinding {
  ruleID: string;
  what: string;
  wcag: string;
  severity: SureSeverity;
  uncertainty: string;
  needed: string;
  html: string;
  cssPath: string;
  xPath: string;
}
// The native result: flattened findings and tallies, or a prevention report.
interface SureNativeResult {
  engine?: Record<string, unknown>;
  violations?: SureFinding[];
  incomplete?: SureFinding[];
  passRuleCount?: number;
  inapplicableRuleCount?: number;
  manualRuleCount?: number;
  manualOccurrenceCount?: number;
  prevented?: boolean;
  error?: string;
}
// An uncertainty report of the engine (per occurrence or per check).
interface SureUncertainty {
  code?: string;
  needed?: string;
}
// One occurrence of a check result (verified against @surea11y/core 1.7.0).
interface SureOccurrence {
  selector?: string;
  html?: string;
  summary?: string;
  occurrenceOutcome?: 'fail' | 'cantTell';
  uncertainty?: SureUncertainty;
}
// One check result.
interface SureCheck {
  ruleId?: string;
  outcome?: 'pass' | 'fail' | 'cantTell' | 'notApplicable';
  severity?: string;
  type?: 'automatic' | 'manual';
  title?: string;
  occurrences?: SureOccurrence[];
  uncertainty?: SureUncertainty;
  meta?: {normativeMappings?: {requirement?: string}[]};
}
// The engine report.
interface SureReport {
  engine?: Record<string, unknown>;
  checksResults?: SureCheck[];
}

/*
  The a11ycore global that the vendored bundle defines in the page. Declared without a
  value, so this declaration is erased at emit and the references inside the page.evaluate
  callback remain bare page-global references.
*/
declare const a11ycore: {
  runa11yCoreInPage: (
    pageUrl: string, contextSelector: string | null, engineOptions: Record<string, unknown>, runOnly: unknown
  ) => SureReport | Promise<SureReport>;
};

/*
  surea11y
  Implements the SureA11y core engine (https://github.com/SureA11y/core) WCAG ruleset.
  Compiled to surea11y.js by tsc (issue #73); edit this file, not the emitted one.

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

// CONSTANTS

// Severity weights within a certainty band, mirroring tests/axe.ts.
const severityWeights: Record<SureSeverity, number> = {
  minor: 0,
  moderate: 0,
  serious: 1,
  critical: 1
};

// FUNCTIONS

// Performs and reports the SureA11y tests.
export const reporter = async (page: Page, report: Report, actIndex: number) => {
  // Get the nonce, if any.
  const act = report.acts[actIndex] as SureAct;
  const {jobData} = report;
  const scriptNonce = (jobData && jobData.lastScriptNonce) as string | undefined;
  // Initialize the act report.
  let data: Record<string, unknown> = {};
  const result: {nativeResult: SureNativeResult; standardResult: StandardResult} = {
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
  let script: string;
  try {
    script = await fs.readFile(`${__dirname}/../surea11y/surea11y.browser.js`, 'utf8');
  }
  catch(error) {
    data.prevented = true;
    data.error = 'ERROR: surea11y bundle missing (see surea11y/README.md for vendoring instructions)';
    return {data, result};
  }
  // Perform the tests and populate the native result.
  result.nativeResult = await page.evaluate(args => new Promise<SureNativeResult>(
    async resolve => {
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
        const criterionOf = (meta: SureCheck['meta']): string => {
          const mappings = meta && meta.normativeMappings || [];
          for (const mapping of mappings) {
            const requirement = String(mapping.requirement || '').replace(/^SC\s*/i, '');
            if (/^\d+\.\d+\.\d+$/.test(requirement)) {
              return requirement;
            }
          }
          return '';
        };
        const violations: SureFinding[] = [];
        const incomplete: SureFinding[] = [];
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
                xPath = window.getXPath(element) ?? '';
              }
            }
            catch(error) {
              // Unresolvable path: instance falls back to excerpt only.
            }
            // Reason for uncertainty: per occurrence, else per check.
            const uncertainty = occurrence.uncertainty || check.uncertainty || {};
            const finding: SureFinding = {
              ruleID: ruleId || '',
              what: (occurrence.summary || check.title || '').replace(/\s+/g, ' ').trim(),
              wcag: criterionOf(check.meta),
              severity: (check.severity || 'moderate').toLowerCase() as SureSeverity,
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
          error: (error as Error).message
        });
      };
    }
  ), {
    scriptNonce,
    script
  });
  const {nativeResult} = result;
  // If the tool ran and rules were selected:
  if (! nativeResult.prevented && act.rules) {
    // Remove results of other rules.
    const {rules} = act;
    nativeResult.violations = (nativeResult.violations || [])
    .filter(finding => rules.includes(finding.ruleID));
    nativeResult.incomplete = (nativeResult.incomplete || [])
    .filter(finding => rules.includes(finding.ruleID));
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
    const bands: [SureFinding[], number, Outcome][] = [
      [nativeResult.incomplete || [], 0, 'cantTell'],
      [nativeResult.violations || [], 2, 'failed']
    ];
    bands.forEach(([findings, baseSeverity, outcome]) => {
      // For each native-result finding:
      findings.forEach(finding => {
        // Add a standard-result instance, forwarding only a known uncertainty code.
        const {ruleID, what, severity, uncertainty, needed, xPath} = finding;
        addInstance(standardResult, {
          ruleID,
          what,
          ordinalSeverity: baseSeverity + (severityWeights[severity] ?? 0),
          outcome,
          uncertainty: (UNCERTAINTY_CODES as string[]).includes(uncertainty) ? uncertainty : undefined,
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
