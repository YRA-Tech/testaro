"use strict";
/*
  © 2023–2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.reporter = exports.selectRules = void 0;
const config_1 = require("../procs/config");
const launch_1 = require("../procs/launch");
// Function to get an empty standard result.
const standard_1 = require("../procs/standard");
const registry_1 = require("../testaro/registry");
// CONSTANTS
// Metadata of all rules in default execution order.
const allRules = [
    {
        id: 'adbID',
        what: 'elements with ambiguous or missing referenced descriptions',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'allCapStyle',
        what: 'elements with all-capital text transformation styles',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: false
    },
    {
        id: 'allCaps',
        what: 'elements with unnecessarily all-capital text substrings',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        outcome: 'cantTell',
        uncertainty: 'judgement-required',
        timeOut: 30,
        defaultOn: true
    },
    {
        id: 'allHidden',
        what: 'page that is entirely or mostly hidden',
        contaminates: false,
        needsAccessibleName: false,
        local: false,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'allSlanted',
        what: 'leaf elements with entirely italic or oblique text longer than 39 characters',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'altScheme',
        what: 'img elements with alt attributes having URLs as their entire values',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'attVal',
        what: 'elements with attributes having illicit values',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: false
    },
    {
        id: 'bulk',
        what: 'large count of visible elements',
        contaminates: false,
        needsAccessibleName: false,
        local: false,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'captionLoc',
        what: 'caption elements that are not first children of table elements',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'datalistRef',
        what: 'elements with ambiguous or missing referenced datalist elements',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'distortion',
        what: 'distorted text',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'docType',
        what: 'document without a doctype property',
        contaminates: false,
        needsAccessibleName: false,
        local: false,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'embAc',
        what: 'active elements embedded in links or buttons',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'headEl',
        what: 'invalid elements within the head',
        contaminates: false,
        needsAccessibleName: false,
        local: false,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'headingAmb',
        what: 'same-level sibling headings with identical texts',
        contaminates: false,
        needsAccessibleName: false,
        local: false,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'hr',
        what: 'hr element instead of styles used for vertical segmentation',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'imageLink',
        what: 'links with image files as their destinations',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'labClash',
        what: 'labeling inconsistencies',
        contaminates: false,
        needsAccessibleName: false,
        local: false,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'legendLoc',
        what: 'legend elements that are not first children of fieldset elements',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'lineHeight',
        what: 'text with a line height less than 1.5 times its font size',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'linkExt',
        what: 'links that automatically open new windows',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'linkOldAtt',
        what: 'links with deprecated attributes',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'linkTo',
        what: 'links without destinations',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'linkUl',
        what: 'missing underlines on inline links',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'miniText',
        what: 'text smaller than 11 pixels',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'nonTable',
        what: 'table elements used for layout',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'optRoleSel',
        what: 'Non-option elements with option roles that have no aria-selected attributes',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'pseudoP',
        what: 'adjacent br elements suspected of nonsemantically simulating p elements',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'radioSet',
        what: 'radio buttons not grouped into standard field sets',
        contaminates: false,
        needsAccessibleName: false,
        local: false,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'role',
        what: 'native-replacing explicit roles',
        contaminates: false,
        needsAccessibleName: false,
        local: false,
        timeOut: 20,
        defaultOn: true
    },
    {
        id: 'secHeading',
        what: 'headings that violate the logical level order in their sectioning containers',
        contaminates: false,
        needsAccessibleName: false,
        local: false,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'styleDiff',
        what: 'style inconsistencies',
        contaminates: false,
        needsAccessibleName: false,
        local: false,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'targetsNear',
        what: 'labels, buttons, inputs, and links too near each other',
        contaminates: false,
        needsAccessibleName: false,
        local: false,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'textSem',
        what: 'semantically vague elements i, b, and/or small',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'title',
        what: 'page title',
        contaminates: false,
        needsAccessibleName: false,
        local: false,
        timeOut: 5,
        defaultOn: false
    },
    {
        id: 'titledEl',
        what: 'title attributes on inappropriate elements',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'zIndex',
        what: 'non-default Z indexes',
        contaminates: false,
        needsAccessibleName: false,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'motion',
        what: 'motion without user request',
        concurrent: true,
        contaminates: false,
        needsAccessibleName: false,
        local: false,
        // The budget covers its own launch, the grace period, two intervals, three tall-viewport images, and two comparisons. It runs concurrently with the serial rules, so a generous budget does not lengthen the act.
        timeOut: 60,
        // Off by default, because it costs a second visit per act and can mistake late loading for motion; a deployment may schedule it less often than its ordinary scans.
        defaultOn: false
    },
    {
        id: 'dupAtt',
        what: 'duplicate attribute values',
        contaminates: false,
        needsAccessibleName: false,
        local: false,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'autocomplete',
        what: 'name and email inputs without autocomplete attributes',
        contaminates: false,
        needsAccessibleName: true,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'linkAmb',
        what: 'links with identical accessible names but different destinations',
        contaminates: false,
        needsAccessibleName: true,
        local: false,
        timeOut: 20,
        defaultOn: true
    },
    {
        id: 'phOnly',
        what: 'input elements with placeholders but no accessible names',
        contaminates: false,
        needsAccessibleName: true,
        local: true,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'buttonMenu',
        what: 'nonstandard keyboard navigation between items of button-controlled menus',
        contaminates: true,
        needsAccessibleName: false,
        local: false,
        timeOut: 15,
        defaultOn: true
    },
    {
        id: 'elements',
        what: 'data on specified elements',
        contaminates: true,
        needsAccessibleName: false,
        local: false,
        timeOut: 10,
        defaultOn: false
    },
    {
        id: 'focAll',
        what: 'discrepancies between focusable and Tab-focused elements',
        contaminates: true,
        needsAccessibleName: false,
        local: false,
        timeOut: 10,
        defaultOn: true
    },
    {
        id: 'focAndOp',
        what: 'Tab-focusable elements that are not operable or vice versa',
        contaminates: true,
        needsAccessibleName: false,
        local: false,
        timeOut: 5,
        defaultOn: true
    },
    {
        id: 'focInd',
        what: 'missing and nonstandard focus indicators',
        contaminates: true,
        needsAccessibleName: false,
        local: false,
        timeOut: 10,
        defaultOn: true
    },
    {
        id: 'focVis',
        what: 'links that are not entirely visible when focused',
        contaminates: true,
        needsAccessibleName: false,
        local: false,
        timeOut: 10,
        defaultOn: true
    },
    {
        id: 'hover',
        what: 'hover-caused content changes',
        contaminates: true,
        needsAccessibleName: false,
        local: false,
        timeOut: 20,
        defaultOn: true
    },
    {
        id: 'hovInd',
        what: 'hover indication nonstandard',
        contaminates: true,
        needsAccessibleName: false,
        local: false,
        timeOut: 10,
        defaultOn: true
    },
    {
        id: 'tabNav',
        what: 'nonstandard keyboard navigation between elements with the tab role',
        contaminates: true,
        needsAccessibleName: false,
        local: false,
        timeOut: 10,
        defaultOn: true
    },
    {
        id: 'textNodes',
        what: 'data on specified text nodes',
        contaminates: true,
        needsAccessibleName: false,
        local: false,
        timeOut: 10,
        defaultOn: false
    }
];
// ERROR HANDLER
process.on('unhandledRejection', reason => {
    console.error(`ERROR: Unhandled Promise Rejection (${reason})`);
});
// FUNCTIONS
// Tests a rule within its time limit and returns the rule, its test result, and its report.
const testRule = async (rule, ruleArgs, onTimeout) => {
    // Initialize the rule result.
    const ruleResult = {
        id: rule.id,
        prevented: false,
        error: '',
        data: {},
        totals: [0, 0, 0, 0],
        instances: [],
        elapsedTime: 0
    };
    let ruleReport = null;
    const startTime = Date.now();
    let timeout;
    try {
        // Apply a time limit to the test.
        const timeLimit = (0, config_1.applyMultiplier)(1000 * rule.timeOut);
        // If the time limit expires during the test:
        const timer = new Promise(resolve => {
            timeout = setTimeout(() => {
                // Add data about the timeout to the rule result.
                ruleResult.prevented = true;
                ruleResult.error = 'Timeout';
                console.log(`ERROR: Test of testaro rule ${rule.id} timed out`);
                onTimeout?.();
                resolve({ timedOut: true });
            }, timeLimit);
        });
        // Try to perform the test and get a test report, loading the rule via the registry.
        // The RuleModule cast widens the per-rule signature union to the registry contract.
        const testReport = registry_1.ruleModules[rule.id]().reporter(...ruleArgs);
        // Get a test or timeout report.
        const raceReport = await Promise.race([timer, testReport]);
        // If it was a test report:
        if (!('timedOut' in raceReport)) {
            ruleReport = raceReport;
        }
        // If an abortable rule timed out, wait for it to finish cleaning up its resources.
        else if (onTimeout) {
            await testReport.catch(() => { });
        }
    }
    // If an error is thrown by the test:
    catch (error) {
        ruleResult.prevented = true;
        const isPageClosed = ['closed', 'Protocol error', 'Target page'].some(phrase => error.message.includes(phrase));
        // If the page has closed:
        if (isPageClosed) {
            // Report this.
            console.log(`ERROR: Test ${rule.id} failed because page closed`);
        }
        // Otherwise, i.e. if the page is open:
        else {
            // Add this to the rule result.
            ruleResult.error = error.message;
            console.log(`ERROR: Test of testaro rule ${rule.id} prevented (${error.message})`);
        }
    }
    finally {
        // Stop the timer, so it cannot report a timeout after the test has ended with an error.
        clearTimeout(timeout);
        // Add the elapsed time to the rule result.
        ruleResult.elapsedTime = Math.round((Date.now() - startTime) / 1000);
    }
    return { rule, ruleResult, ruleReport };
};
/*
  Returns the rules that a testaro test act selects.
  - With neither rules nor rulesForcedOn nor rulesForcedOff: the default rules.
  - With rules: exactly the listed rules.
  - With rulesForcedOn and/or rulesForcedOff: the default rules, plus those forced on, minus those forced off.
  The selection is invalid if rules is combined with either forced property, if a rule is forced both on and off, if rules is empty, or if rules or rulesForcedOn names an unknown rule. An unknown rule in rulesForcedOff is ignored with a warning, because not testing for a rule that does not exist is harmless, while invalidating the selection would stop every rule of the act.
  For compatibility, rules may still begin with 'y' (only the listed rules) or 'n' (the default rules except the listed ones). That form is deprecated, and a warning says so.
  Rules are always tested for in allRules order, whatever the order in which they are named.
*/
const selectRules = (act) => {
    const { rules, rulesForcedOn, rulesForcedOff } = act;
    const allRuleIDs = allRules.map(rule => rule.id);
    const defaultIDs = allRules.filter(rule => rule.defaultOn).map(rule => rule.id);
    const selection = { ruleIDs: [], error: '', unknownIDs: [], warnings: [] };
    const getUnknown = (ids) => ids.filter(id => !allRuleIDs.includes(id));
    const invalidate = (error) => {
        selection.error = error;
        return selection;
    };
    const choose = (ids) => {
        selection.ruleIDs = allRules.filter(rule => ids.has(rule.id)).map(rule => rule.id);
        return selection;
    };
    // If an explicit list is combined with forced rules:
    if (rules && (rulesForcedOn || rulesForcedOff)) {
        return invalidate('rules cannot be combined with rulesForcedOn or rulesForcedOff');
    }
    // Otherwise, if there is an explicit list:
    if (rules) {
        const legacyMode = ['y', 'n'].includes(rules[0]) ? rules[0] : '';
        const listedIDs = legacyMode ? rules.slice(1) : rules;
        if (!listedIDs.length) {
            return invalidate('rules names no rules');
        }
        selection.unknownIDs = getUnknown(listedIDs);
        if (selection.unknownIDs.length) {
            return invalidate(`unknown rules: ${selection.unknownIDs.join(', ')}`);
        }
        if (legacyMode) {
            selection.warnings.push(legacyMode === 'y'
                ? 'The leading \'y\' of rules is deprecated: list only the rule IDs'
                : 'The leading \'n\' of rules is deprecated: use rulesForcedOff instead');
        }
        return choose(new Set(legacyMode === 'n' ? defaultIDs.filter(id => !listedIDs.includes(id)) : listedIDs));
    }
    // Otherwise, start from the default rules and apply any forced rules.
    const onIDs = rulesForcedOn ?? [];
    const offIDs = rulesForcedOff ?? [];
    const conflictIDs = onIDs.filter(id => offIDs.includes(id));
    if (conflictIDs.length) {
        return invalidate(`rules forced both on and off: ${conflictIDs.join(', ')}`);
    }
    const unknownOnIDs = getUnknown(onIDs);
    const unknownOffIDs = getUnknown(offIDs);
    selection.unknownIDs = [...unknownOnIDs, ...unknownOffIDs];
    if (unknownOnIDs.length) {
        return invalidate(`unknown rules: ${unknownOnIDs.join(', ')}`);
    }
    if (unknownOffIDs.length) {
        selection.warnings.push(`Unknown rules in rulesForcedOff were ignored: ${unknownOffIDs.join(', ')}`);
    }
    return choose(new Set([...defaultIDs, ...onIDs].filter(id => !offIDs.includes(id))));
};
exports.selectRules = selectRules;
// Conducts and reports Testaro tests.
const reporter = async (page, report, actIndex) => {
    const act = report.acts[actIndex];
    const givenPage = page;
    const { args, stopOnFail, withItems } = act;
    // Get the target of the act's launch property (see actSpecs.js), if any, else that of the job.
    const target = (act.launch?.target || report.target);
    const url = target.url;
    const browserID = act.launch ? act.launch.browserID || report.browserID : report.browserID;
    const argRules = args ? Object.keys(args) : null;
    // Get the rules to be tested for.
    const selection = (0, exports.selectRules)(act);
    selection.warnings.forEach(warning => console.log(`WARNING: ${warning}`));
    // Initialize the act data.
    const data = {
        prevented: false,
        error: '',
        rulePreventions: {},
        rulesInvalid: selection.unknownIDs,
        ruleTestTimes: [],
        ruleData: {}
    };
    if (selection.warnings.length) {
        data.ruleWarnings = selection.warnings;
    }
    // The changed subtree roots the act is scoped to, if any (report.scope, set by the acts loop).
    const scopeRoots = report.scope?.roots ?? null;
    if (scopeRoots) {
        data.scope = { localRules: [], pageRules: [] };
    }
    // Initialize the act result.
    const result = {
        nativeResult: {},
        standardResult: (0, standard_1.getStandardResult)()
    };
    const { standardResult } = result;
    // Adds a rule test to the act data and the standard result.
    const recordRuleTest = ({ rule, ruleResult, ruleReport }) => {
        // If the test ended with a report:
        if (ruleReport) {
            // Add the rule-report properties to the rule result.
            ruleResult.data = ruleReport.data;
            ruleResult.totals = ruleReport.totals;
            ruleResult.instances = ruleReport.standardInstances;
            // Add the rule-result properties to the result.
            if (Object.keys(ruleReport.data).length) {
                data.ruleData[rule.id] = ruleResult.data;
            }
            if (ruleResult.totals) {
                ruleResult.totals.forEach((total, index) => {
                    standardResult.totals[index] += Math.round(total);
                });
            }
            if (ruleResult.instances?.length) {
                // Apply the rule's default outcome to instances without their own.
                ruleResult.instances.forEach(instance => {
                    instance.outcome ??= rule.outcome ?? 'failed';
                    if (instance.outcome === 'cantTell' && rule.uncertainty) {
                        instance.uncertainty ??= rule.uncertainty;
                    }
                    standardResult.outcomeTotals[instance.outcome] += instance.count || 1;
                });
                standardResult.instances.push(...ruleResult.instances);
            }
        }
        // Add the elapsed time to the data.
        data.ruleTestTimes.push([rule.id, ruleResult.elapsedTime]);
        // If the test timed out or otherwise failed:
        if (ruleResult.prevented) {
            // Add this and the error to the data.
            data.rulePreventions[rule.id] = ruleResult.error;
        }
    };
    // If the rule selection is valid:
    if (!selection.error) {
        // Get the rules to be tested for, in their execution order.
        const jobRules = allRules.filter(rule => selection.ruleIDs.includes(rule.id));
        // Separate the rules that run concurrently on their own pages from the serial rules.
        const concurrentRules = jobRules.filter(rule => rule.concurrent);
        const serialRules = jobRules.filter(rule => !rule.concurrent);
        // Start the tests of the concurrent rules without waiting for them to end.
        const concurrentTests = concurrentRules.map(rule => {
            console.log(`Starting concurrent rule ${rule.id}`);
            // A concurrent rule tests the whole page, whatever the scope.
            if (scopeRoots) {
                data.scope.pageRules.push(rule.id);
            }
            // Create a signal with which to tell the rule that it has timed out.
            const aborter = new AbortController();
            // Initialize an argument array for the reporter, with no page.
            const ruleArgs = [undefined, report, actIndex, withItems, aborter.signal];
            // If the testaro test act specifies extra arguments for this rule:
            if (argRules?.includes(rule.id)) {
                // Add them to the argument array.
                ruleArgs.push(...args[rule.id]);
            }
            return testRule(rule, ruleArgs, () => aborter.abort());
        });
        // Initialize the tests of the serial rules.
        const ruleTests = [];
        let justPrevented = false;
        // For each serial rule to be tested for:
        for (let ruleIndex = 0; ruleIndex < serialRules.length; ruleIndex++) {
            const rule = serialRules[ruleIndex];
            console.log(`Starting rule ${rule.id}`);
            // Make the browser emulate headedness in all cases, because performance does not suffer.
            const headEmulation = rule.id.startsWith('shoot') ? 'high' : 'high';
            // Get whether the rule needs a new browser launched. Under page isolation the first rules
            // run on the live page provided; a contaminating rule still gets a fresh page.
            const previousRule = ruleIndex > 0 ? serialRules[ruleIndex - 1] : null;
            const needsLaunch = (ruleIndex === 0 && !(page && report.jobData?.isolation === 'page'))
                || justPrevented
                || Boolean(previousRule?.contaminates)
                || serialRules[ruleIndex].needsAccessibleName && !previousRule?.needsAccessibleName
                    && !(ruleIndex === 0 && page);
            const pageClosed = page && page.isClosed();
            // If it does, or if the page has closed:
            if (needsLaunch || pageClosed) {
                // If the page has closed when it is expected to be open:
                if (pageClosed && !needsLaunch) {
                    // Report this.
                    console.log(`WARNING: Relaunching browser for test ${rule.id} after abnormal closure`);
                }
                // Create a browser, replace the page, and visit the target, retrying twice if necessary.
                page = await (0, launch_1.launch)({
                    report,
                    actIndex,
                    tempBrowserID: browserID,
                    tempURL: url,
                    headEmulation,
                    xPathNeed: 'script',
                    needsAccessibleName: serialRules[ruleIndex].needsAccessibleName,
                    retries: Number.isInteger(act.retries) && act.retries >= 0
                        ? act.retries
                        : config_1.ruleLaunchRetries
                });
            }
            // Otherwise, if the first serial rule runs on the given live page, which no launch for this act prepared:
            else if (ruleIndex === 0 && givenPage) {
                // Give it the XPath script that doTest uses and, if the rule needs them, accessible names.
                await (0, launch_1.preparePage)(page, { xPathNeed: 'script', needsAccessibleName: rule.needsAccessibleName });
            }
            // If no page exists, the launch (or the replay of a checkpoint's acts) failed: the
            // target is unreachable, so prevent the act and stop testing rules.
            if (!page) {
                // The launch recorded its reason on the act. Keep it: the data and result returned here replace the act's, so it would otherwise be lost. The rule is identified by its key in rulePreventions.
                const message = String(report.jobData?.abortMessage
                    || act.data?.error
                    || `Launch or checkpoint replay failed before rule ${rule.id}`);
                data.rulePreventions[rule.id] = message;
                data.prevented = true;
                data.error = message;
                standardResult.prevented = true;
                console.log(`ERROR: ${message}`);
                break;
            }
            // Report crashes and disconnections during this test.
            let crashHandler;
            let disconnectHandler;
            if (page && !page.isClosed()) {
                crashHandler = () => {
                    console.log(`ERROR: Page crashed during ${rule.id} test`);
                };
                page.on('crash', crashHandler);
            }
            // The page exists whenever this runs; verbatim from the original.
            const browser = page.context().browser();
            if (browser) {
                disconnectHandler = () => {
                    console.log(`ERROR: Browser disconnected during ${rule.id} test`);
                };
                browser.on('disconnected', disconnectHandler);
            }
            // Restrict an element-local rule to the scope roots; a page-level rule tests the page.
            if (scopeRoots) {
                report.ruleScopeRoots = rule.local ? scopeRoots : null;
                (rule.local ? data.scope.localRules : data.scope.pageRules).push(rule.id);
            }
            // Initialize an argument array for the reporter.
            const ruleArgs = [page, report, actIndex, withItems];
            // If the rule needs a temporary directory:
            if (rule.needsTmpDir) {
                // Add its path to the argument array.
                ruleArgs.push(report.jobData.tmpDir);
            }
            // If the testaro test act specifies extra arguments for this rule:
            if (argRules?.includes(rule.id)) {
                // Add them to the argument array.
                ruleArgs.push(...args[rule.id]);
            }
            // Test the rule and keep the test for recording after all tests have ended.
            const ruleTest = await testRule(rule, ruleArgs);
            ruleTests.push(ruleTest);
            justPrevented = ruleTest.ruleResult.prevented;
            // Clear the error listeners.
            if (page && !page.isClosed() && crashHandler) {
                page.off('crash', crashHandler);
                crashHandler = null;
            }
            if (browser && disconnectHandler) {
                browser.off('disconnected', disconnectHandler);
                disconnectHandler = null;
            }
            // Force a garbage collection.
            try {
                if (global.gc) {
                    global.gc();
                }
            }
            catch (error) { }
            // If testing is to stop after a failure and the page failed the test:
            if (stopOnFail && ruleTest.ruleReport?.totals?.some(total => total)) {
                // Test for no more serial rules.
                break;
            }
        }
        // Wait for the tests of the concurrent rules to end and add them to the tests.
        ruleTests.push(...await Promise.all(concurrentTests));
        if (ruleTests.length && ruleTests.every(test => test.ruleResult.prevented)) {
            data.prevented = true;
            standardResult.prevented = true;
            data.error ||= 'All attempted Testaro rules were prevented';
        }
        // Record the tests in the order of the rules.
        ruleTests
            .sort((a, b) => jobRules.indexOf(a.rule) - jobRules.indexOf(b.rule))
            .forEach(recordRuleTest);
        // Sort the rule test times.
        data.ruleTestTimes.sort((a, b) => b[1] - a[1]);
    }
    // Otherwise, i.e. if the rule selection is invalid:
    else {
        // Report this and stop testing.
        standardResult.prevented = true;
        data.prevented = true;
        const message = `ERROR: Testaro rule specification invalid (${selection.error})`;
        data.error = message;
        console.log(message);
    }
    // Close the last page the tool launched, unless it is the live page it was given.
    if (page && page !== givenPage) {
        await (0, launch_1.browserClose)(page);
    }
    delete report.ruleScopeRoots;
    return {
        data,
        result
    };
};
exports.reporter = reporter;
