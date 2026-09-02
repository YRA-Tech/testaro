/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  testAct.js
  Performs a test act: launches (or prepares) a page for the tool, runs the tool's reporter,
  and records the act's data and result in the report. Used by the child process of process
  isolation (doTestAct.js) and directly by the acts loop under browser and page isolation.
*/

// IMPORTS

const {browserClose, launch, preparePage} = require('./launch');

// CONSTANTS

/*
  Tool XPath requirements.
    none: Needs no script or extra load time.
    own: Needs extra load time for its own XPath computations.
    script: Needs the window.getXPath script.
    attribute: Needs data-xpath attributes made with window.getXPath.
*/
const xPathNeeds = exports.xPathNeeds = {
  alfa: 'own',
  aslint: 'own',
  axe: 'attribute',
  ed11y: 'script',
  htmlcs: 'attribute',
  ibm: 'attribute',
  nuVal: 'attribute',
  nuVnu: 'attribute',
  pour: 'script',
  qualWeb: 'attribute',
  surea11y: 'script',
  wave: 'script'
};
const accessibleNameNeeders = ['testaro'];

// FUNCTIONS

/*
  Performs the test act at an index of a report and revises the report. Under page isolation,
  livePage is the live page of the current checkpoint, which tools that take a page use as it
  is (after preparation); otherwise each tool gets a page launched for it. The testaro tool
  launches its own pages per rule (starting from livePage if given).
*/
exports.performTestAct = async ({report, actIndex, livePage = null}) => {
  const act = report.acts[actIndex];
  const {which} = act;
  const useLivePage = Boolean(livePage) && report.jobData?.isolation === 'page';
  let page;
  // If the tool is not Testaro:
  if (which !== 'testaro') {
    // If the tool is to use the live page, prepare it for the tool.
    if (useLivePage) {
      page = livePage;
      await preparePage(page, {
        xPathNeed: xPathNeeds[which] ?? 'none',
        needsAccessibleName: accessibleNameNeeders.includes(which)
      });
    }
    // Otherwise, launch a browser and navigate to the URL (replaying the checkpoint's acts).
    else {
      const browserID = act.launch && act.launch.browserID || report.browserID;
      const targetURL = act.launch && act.launch.target && act.launch.target.url || report.target.url;
      page = await launch({
        report,
        actIndex,
        tempBrowserID: browserID,
        tempURL: targetURL,
        xPathNeed: xPathNeeds[which] ?? 'none',
        needsAccessibleName: accessibleNameNeeders.includes(which)
      });
      // If the launch aborted the job, stop.
      if (report.jobData?.aborted) {
        await browserClose(page);
        return;
      }
    }
  }
  // If the page exists after the launch, or if the tool is Testaro:
  if (page || which === 'testaro') {
    try {
      // Make the act reporter perform the specified tests of the tool.
      const actReport = await require(`../tests/${which}`)
      .reporter(useLivePage && which === 'testaro' ? livePage : page, report, actIndex, 65);
      // Add the data and result to the act, keeping any checkpoint replay record the launch
      // added to the act's data and any scope record the acts loop added (which the tool may
      // have extended).
      const {replay, scope} = act.data ?? {};
      const toolScope = actReport.data && actReport.data.scope;
      act.data = actReport.data ?? {};
      if (replay) {
        act.data.replay = replay;
      }
      if (scope) {
        act.data.scope = {... scope, ... (toolScope ?? {})};
      }
      act.result = actReport.result;
      // If the tool reported that the page prevented testing:
      if (act.data && act.data.prevented) {
        const {standardResult} = act.result;
        // Add this to any standard result.
        if (standardResult) {
          standardResult.prevented = true;
        }
        // Add prevention data to the job data.
        report.jobData.preventions[which] = act.data.error;
      }
    }
    // If the tool invocation failed:
    catch(error) {
      const message = error.message.slice(0, 400);
      console.log(`ERROR: Test act ${act.which} failed (${message})`);
      act.data ??= {};
      act.data.prevented = true;
      act.data.error = `ERROR performing the act (${message})`;
      report.jobData.preventions[which] = act.data.error;
      throw error;
    }
    finally {
      // Close the page and its context, unless it is the live page.
      if (page && page !== livePage) {
        await browserClose(page);
      }
    }
  }
  // Otherwise, i.e. if the page does not exist after the launch:
  else {
    // Add this to the act.
    act.data ??= {};
    act.data.prevented = true;
    act.data.error = report.jobData?.abortMessage || 'No page';
    // Add the prevention to the job data.
    report.jobData.preventions[which] = act.data.error;
    console.log('ERROR: No page');
  }
};
