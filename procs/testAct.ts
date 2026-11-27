/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Page} from 'playwright';
import {browserClose, launch, preparePage} from './launch';
import {toolLoaders} from '../tests/registry';
import type {ToolModule} from '../tests/registry';
import type {Act, BrowserID, Report, ToolID} from '../types';

/*
  testAct
  Performs a test act: launches (or prepares) a page for the tool, runs the tool's reporter,
  and records the act's data and result in the report. Used by the child process of process
  isolation (doTestAct.js) and directly by the acts loop under browser and page isolation.
  Compiled to testAct.js by tsc (issue #73); edit this file, not the emitted one.
*/

// TYPES

// How a tool uses XPaths (see xPathNeeds).
export type XPathNeed = 'none' | 'own' | 'script' | 'attribute';
// The arguments of performTestAct.
export interface TestActOptions {
  report: Report;
  actIndex: number;
  livePage?: Page | null;
}
// The data of a test act that performTestAct reads and writes.
interface TestActData {
  prevented?: boolean;
  error?: string;
  replay?: unknown;
  scope?: object;
  [key: string]: unknown;
}
// A test act, as performTestAct reads it (until Phase 4.5 types each act).
type TestAct = Act & {
  which: string;
  launch?: {browserID?: BrowserID; target?: {url?: string}};
  data?: TestActData;
};

// CONSTANTS

/*
  Tool XPath requirements.
    none: Needs no script or extra load time.
    own: Needs extra load time for its own XPath computations.
    script: Needs the window.getXPath script.
    attribute: Needs data-xpath attributes made with window.getXPath.
*/
export const xPathNeeds: Partial<Record<ToolID, XPathNeed>> = {
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
const accessibleNameNeeders: string[] = ['testaro'];

// FUNCTIONS

/*
  Returns the adapter module of a tool. A tool ID that job validation accepts but the registry
  lacks (only an inherited property name, such as toString, passes the tools[variable] test of
  procs/job.js) is required by its path, as every tool was before the registry, so that it
  fails with the same error.
*/
/*
  Returns whether a value can hold properties. Job validation does not reject a test act's data
  property, so a job may make it a primitive. Before this file was strict (issue #73), assigning
  properties to such a value was silently ignored; the callers keep that behavior by checking.
*/
const canHoldProperties = (value: unknown): boolean => ['object', 'function'].includes(typeof value);
const loadTool = (which: string): ToolModule => Object.hasOwn(toolLoaders, which)
  ? toolLoaders[which as ToolID]()
  : require(`../tests/${which}`);

/*
  Performs the test act at an index of a report and revises the report. Under page isolation,
  livePage is the live page of the current checkpoint, which tools that take a page use as it
  is (after preparation); otherwise each tool gets a page launched for it. The testaro tool
  launches its own pages per rule (starting from livePage if given). Returns whether the tool
  was left without a page (noPage), so that a caller need not infer it from the act's error.
*/
export const performTestAct = async (
  {report, actIndex, livePage = null}: TestActOptions
): Promise<{noPage: boolean}> => {
  const act = report.acts[actIndex] as TestAct;
  const {which} = act;
  const useLivePage = Boolean(livePage) && report.jobData?.isolation === 'page';
  let page: Page | null | undefined;
  // If the tool is not Testaro:
  if (which !== 'testaro') {
    // If the tool is to use the live page, prepare it for the tool.
    if (useLivePage) {
      // useLivePage implies that livePage exists.
      page = livePage!;
      await preparePage(page, {
        xPathNeed: xPathNeeds[which as ToolID] ?? 'none',
        needsAccessibleName: accessibleNameNeeders.includes(which)
      });
    }
    // Otherwise, launch a browser and navigate to the URL (replaying the checkpoint's acts).
    else {
      const browserID = act.launch && act.launch.browserID || report.browserID;
      const targetURL = act.launch && act.launch.target && act.launch.target.url || report.target!.url;
      page = await launch({
        report,
        actIndex,
        tempBrowserID: browserID,
        tempURL: targetURL,
        xPathNeed: xPathNeeds[which as ToolID] ?? 'none',
        needsAccessibleName: accessibleNameNeeders.includes(which)
      });
      // If the launch aborted the job, stop.
      if (report.jobData?.aborted) {
        await browserClose(page);
        return {noPage: ! page};
      }
    }
  }
  // If the page exists after the launch, or if the tool is Testaro:
  if (page || which === 'testaro') {
    try {
      // Make the act reporter perform the specified tests of the tool.
      // The page is undefined only for testaro without a live page; testaro launches its own.
      const actReport = await loadTool(which)
      .reporter(useLivePage && which === 'testaro' ? livePage as Page : page as Page, report, actIndex, 65);
      // Add the data and result to the act, keeping any checkpoint replay record the launch
      // added to the act's data and any scope record the acts loop added (which the tool may
      // have extended).
      // The assignments below to the tool's data and standard result cannot meet a primitive:
      // every adapter builds both as objects, and the registry checks that data is an object.
      const {replay, scope} = act.data ?? {};
      const toolScope = actReport.data && (actReport.data as TestActData).scope;
      act.data = actReport.data as TestActData ?? {};
      if (replay) {
        act.data.replay = replay;
      }
      if (scope) {
        act.data.scope = {... scope, ... (toolScope ?? {})};
      }
      act.result = actReport.result as Act['result'];
      // If the tool reported that the page prevented testing:
      if (act.data && act.data.prevented) {
        const {standardResult} = act.result!;
        // Add this to any standard result.
        if (standardResult) {
          standardResult.prevented = true;
        }
        // Add prevention data to the job data.
        report.jobData!.preventions![which as ToolID] = act.data.error;
      }
    }
    // If the tool invocation failed:
    catch(error) {
      const message = (error as Error).message.slice(0, 400);
      console.log(`ERROR: Test act ${act.which} failed (${message})`);
      act.data ??= {};
      if (canHoldProperties(act.data)) {
        act.data.prevented = true;
        act.data.error = `ERROR performing the act (${message})`;
      }
      report.jobData!.preventions![which as ToolID] = act.data.error;
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
    // Add this to the act, keeping the reason that the launch recorded on the act (launch failure, navigation failure and its HTTP status or browser error, checkpoint replay failure). 'No page' is only the fallback for a missing page with no recorded reason.
    act.data ??= {};
    if (canHoldProperties(act.data)) {
      act.data.prevented = true;
      act.data.error = report.jobData?.abortMessage as string
      || act.data.error
      || act.result?.error as string
      || 'No page';
    }
    // Add the prevention to the job data.
    report.jobData!.preventions![which as ToolID] = act.data.error;
    console.log('ERROR: No page');
    return {noPage: true};
  }
  return {noPage: false};
};
