/*
  © 2021–2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  doActs.js
  Performs the acts of a job.
*/

// IMPORTS

const {addError} = require('./error');
const {closeSharedBrowser, launch} = require('./launch');
// Function to perform a test act in this process (browser and page isolation).
const {performTestAct} = require('./testAct');
const {tools, toolInputs} = require('./job');
const {fork} = require('child_process');
const {pruneCatalog} = require('./catalog');
// Function to perform an act on a live page.
const {doInteractionAct, defaultInteraction} = require('./actDo');
// Function to snapshot a page state as a checkpoint.
const {makeCheckpoint} = require('./checkpoint');
// Function to get an empty standard result.
const {getStandardResult} = require('./standard');
// Module to handle file system operations.
const {applyMultiplier} = require('./config');
const fs = require('fs/promises');
const path = require('path');

// CONSTANTS

// Seconds to wait between actions.
const waits = Number.parseInt(process.env.WAITS) || 0;
// Time limits in seconds on tools, accounting for page reloads by 6 Testaro tests.
const timeLimits = {
  alfa: 35,
  aslint: 45,
  axe: 30,
  ed11y: 30,
  htmlcs: 30,
  ibm: 30,
  nuVal: 40,
  nuVnu: 25,
  pour: 35,
  qualWeb: 45,
  surea11y: 35,
  testaro: 200 + Math.round(6 * waits / 1000),
  wave: 25
};
// Abort aggressiveness.
const abortAssertively = process.env.ABORT_ASSERTIVELY === 'true';

// FUNCTIONS

// Returns a view of a standard instance that includes the legacy element properties (tagName,
// id, excerpt, location, boxID, pathID, text) derived from its catalog entry, so that
// expectations written before the catalog existed can still be evaluated. A summary instance
// (no catalog entry) gets the empty values that legacy summary instances carried.
const getLegacyInstanceView = (instance, catalog) => {
  const view = {... instance};
  const entry = instance.catalogIndex === undefined ? null : catalog?.[String(instance.catalogIndex)];
  if (! entry) {
    view.tagName ??= '';
    view.id ??= '';
    view.excerpt ??= '';
    view.location ??= {doc: '', type: '', spec: {}};
    return view;
  }
  ['tagName', 'id', 'pathID', 'boxID', 'text', 'startTag'].forEach(key => {
    if (view[key] === undefined && entry[key] !== undefined) {
      view[key] = entry[key];
    }
  });
  // The legacy excerpt was the element text, or its markup if it had no text.
  if (view.excerpt === undefined) {
    view.excerpt = entry.text || entry.startTag || '';
  }
  if (view.location === undefined) {
    if (entry.id) {
      view.location = {doc: 'dom', type: 'selector', spec: `#${entry.id}`};
    }
    else if (entry.boxID) {
      const [x, y, width, height] = entry.boxID.split(/[:,]/).map(Number);
      view.location = {doc: 'dom', type: 'box', spec: {x, y, width, height}};
    }
    else if (entry.pathID) {
      view.location = {doc: 'dom', type: 'xpath', spec: entry.pathID};
    }
  }
  return view;
};
// Returns a property value and whether it satisfies an expectation.
const isTrue = exports.isTrue = (object, specs, catalog) => {
  const property = specs[0];
  const propertyTree = property.split('.');
  // Test-act expectations reference results by property path. Most fixtures use the
  // bare standardResult.* path, whose value lives at act.result.standardResult; a few
  // use result.* directly on the act. Resolve against act.result when the first segment
  // is absent on the act but present on act.result, so both conventions work.
  let base = object;
  if (
    property.length && object && object[propertyTree[0]] === undefined
    && object.result && object.result[propertyTree[0]] !== undefined
  ) {
    base = object.result;
  }
  let actual = property.length ? base[propertyTree[0]] : base;
  // Identify the actual value of the specified property.
  while (propertyTree.length > 1 && actual !== undefined) {
    propertyTree.shift();
    actual = actual[propertyTree[0]];
    // If the value is a standard instance, include its legacy element view.
    if (
      actual && typeof actual === 'object' && catalog
      && actual.ruleID !== undefined && actual.ordinalSeverity !== undefined
    ) {
      actual = getLegacyInstanceView(actual, catalog);
    }
  }
  // If the expectation is that the property does not exist:
  if (specs.length === 1) {
    // Return whether the expectation is satisfied.
    return [actual, actual === undefined];
  }
  // Otherwise, i.e. if the expectation is of a property value:
  else if (specs.length === 3) {
    // Return whether the expectation was fulfilled.
    const relation = specs[1];
    const criterion = specs[2];
    let satisfied;
    if (actual === undefined) {
      return [null, false];
    }
    else if (relation === '=') {
      satisfied = actual === criterion;
    }
    else if (relation === '<') {
      satisfied = actual < criterion;
    }
    else if (relation === '>') {
      satisfied = actual > criterion;
    }
    else if (relation === '!') {
      satisfied = actual !== criterion;
    }
    else if (relation === 'i') {
      satisfied = typeof actual === 'string' && actual.includes(criterion);
    }
    else if (relation === '!i') {
      satisfied = typeof actual === 'string' && ! actual.includes(criterion);
    }
    else if (relation === 'e') {
      satisfied = typeof actual === 'object'
      && JSON.stringify(actual) === JSON.stringify(criterion);
    }
    return [actual, satisfied];
  }
  // Otherwise, i.e. if the specifications are invalid:
  else {
    // Return this.
    return [null, false];
  }
};
// Returns the browser ID of an act.
const getActBrowserID = (report, actIndex) => report?.acts[actIndex]?.browserID
|| report?.browserID
|| '';
// Returns the target URL of an act.
const getActTargetURL = (report, actIndex) => report?.acts[actIndex]?.target?.url
|| report?.target?.url
|| '';
// Performs the acts in a report and adds the results to the report.
exports.doActs = async (report, opts = {}) => {
  // Fire-and-forget progress emitter (see #44), mirroring run.js: a handler
  // exception is logged, never propagated, so a faulty consumer can never abort
  // the job.
  const emitProgress = event => {
    if (opts && typeof opts.onProgress === 'function') {
      try {
        opts.onProgress(event);
      }
      catch (error) {
        console.log(`ERROR in onProgress callback: ${error.message}`);
      }
    }
  };
  // Make a temporary copy of the report. Precondition: report is valid.
  let tempReport = JSON.parse(JSON.stringify(report));
  let page = null;
  let {acts} = tempReport;
  // Get the standardization specification.
  const standard = tempReport.standard || 'only';
  // Get the isolation level of test acts.
  const isolation = tempReport.jobData.isolation || 'process';
  // Get the path to a writable temporary directory.
  const {tmpDir} = report.jobData;
  let reportPath;
  // Get a path for temporary reports.
  reportPath = path.join(tmpDir, `${tempReport.id}.json`);
  // Initialize the count of completed acts.
  let actCount = 0;
  /*
    Checkpoint bookkeeping. Checkpoint mode is on when the job has a checkpoint act; then a
    test act observes the latest checkpoint, and interaction acts since the last checkpoint
    make an implicit one before a test act. In legacy mode (no checkpoint act) every test act
    observes checkpoint 0, as before, and such interaction acts only draw a warning.
  */
  const checkpointMode = acts.some(act => act.type === 'checkpoint');
  const interaction = defaultInteraction;
  // The URL the page most recently navigated to (by a launch or url act) and that act's index.
  let lastNavURL = '';
  let lastLaunchActIndex = null;
  // Indexes of interaction acts since the last navigation (a checkpoint's replay) and since the
  // last checkpoint (what makes a checkpoint necessary).
  let sinceNav = [];
  let dirtySince = [];
  // Adds a warning to the job data.
  const addWarning = message => {
    tempReport.jobData.warnings ??= [];
    tempReport.jobData.warnings.push(message);
    console.log(`WARNING: ${message}`);
  };
  // Creates a checkpoint from the live page and returns it, or null on failure.
  const checkpointNow = async (name, checkpointActIndex, implicit) => {
    emitProgress({event: 'checkpointStart', index: tempReport.checkpoints.length, name});
    try {
      const checkpoint = await makeCheckpoint({
        page,
        report: tempReport,
        name,
        actIndex: checkpointActIndex,
        implicit,
        launchActIndex: lastLaunchActIndex,
        launchURL: lastNavURL,
        replay: [... sinceNav],
        interaction
      });
      dirtySince = [];
      emitProgress({
        event: 'checkpointEnd',
        index: checkpoint.index,
        name,
        kind: checkpoint.kind,
        elapsedMs: checkpoint.elapsedMs
      });
      return checkpoint;
    }
    catch(error) {
      console.log(`ERROR: Checkpoint ${name} failed (${error.message})`);
      return null;
    }
  };
  // For each act in the temporary report (a numeric index, which a next act may change):
  for (let actIndex = 0; actIndex < acts.length; actIndex++) {
    // If the job has not been aborted:
    if (tempReport?.jobData && ! tempReport.jobData.aborted) {
      let act = acts[actIndex];
      const {type, which} = act;
      // #44: signal act start so a consumer can heartbeat and advance a live
      // per-act (per-tool, for test acts) view while the act runs.
      emitProgress({event: 'actStart', index: actIndex, type, which});
      const actSuffix = type === 'test' ? ` ${which}` : '';
      const message = `>>>> ${type}${actSuffix}`;
      // Log the act.
      console.log(message);
      // If the act is an index changer:
      if (type === 'next') {
        const condition = act.if;
        const logSuffix = condition.length === 3 ? ` ${condition[1]} ${condition[2]}` : '';
        console.log(`>> ${condition[0]}${logSuffix}`);
        // Identify the act to be checked: the last non-next act before this one.
        const ifActIndex = acts.slice(0, actIndex).map(act => act.type !== 'next').lastIndexOf(true);
        // Determine whether its jump condition is true.
        const truth = ifActIndex > -1
          ? isTrue(acts[ifActIndex].result, condition, tempReport.catalog)
          : [null, false];
        // Add the result to the act.
        act.result = {
          property: condition[0],
          relation: condition[1],
          criterion: condition[2],
          value: truth[0],
          jumpRequired: truth[1]
        };
        // If the condition is true:
        if (truth[1]) {
          // If the performance of acts is to stop:
          if (act.jump === 0) {
            // Stop processing acts.
            break;
          }
          // Otherwise, if there is a numerical jump:
          else if (act.jump) {
            // Set the act index accordingly (the loop increments it).
            actIndex += act.jump - 1;
          }
          // Otherwise, if there is a named next act:
          else if (act.next) {
            // Set the new index accordingly, or stop if it does not exist.
            const nextIndex = acts.findIndex(act => act.name === act.next);
            if (nextIndex === -1) {
              break;
            }
            actIndex = nextIndex - 1;
          }
        }
      }
      // Otherwise, if the act is a launch:
      else if (type === 'launch') {
        // Launch a browser, navigate, optionally make a screenshot, and add the result to the act.
        const imageScale = Number.isFinite(tempReport.imageScale) && tempReport.imageScale > 1
          ? tempReport.imageScale
          : 1;
        page = await launch({
          report: tempReport,
          actIndex,
          tempBrowserID: getActBrowserID(tempReport, actIndex),
          tempURL: getActTargetURL(tempReport, actIndex),
          xPathNeed: 'none',
          contextOverrides: imageScale > 1 ? {deviceScaleFactor: imageScale} : {},
          replay: false
        });
        // If this failed (launch has already logged and, if so configured, aborted):
        if (! page) {
          // Report this.
          addError(false, false, tempReport, actIndex, 'ERROR: Launch failed');
        }
        // Otherwise, record the navigation for checkpoints: a launch of a page other than the
        // latest checkpoint's calls for a new checkpoint.
        else {
          lastNavURL = page.url();
          lastLaunchActIndex = actIndex;
          sinceNav = [];
          const latest = tempReport.checkpoints?.at(-1);
          if (latest && page.url() !== latest.url) {
            dirtySince.push(actIndex);
          }
        }
      }
      // Otherwise, if the act is a checkpoint:
      else if (type === 'checkpoint') {
        // If a page exists:
        if (page && tempReport.checkpoints) {
          // Snapshot it as the checkpoint.
          const startTime = Date.now();
          const checkpoint = await checkpointNow(act.which, actIndex, false);
          act.result = checkpoint
            ? {
              success: true,
              index: checkpoint.index,
              kind: checkpoint.kind,
              url: checkpoint.url,
              title: checkpoint.title,
              elementCount: checkpoint.elementCount,
              imageIndexes: checkpoint.imageIndexes,
              elapsedMs: Date.now() - startTime
            }
            : {success: false, error: 'Checkpoint failed'};
        }
        // Otherwise, i.e. if no page exists:
        else {
          // Report this.
          addError(true, false, tempReport, actIndex, 'ERROR: No page to checkpoint');
        }
      }
      // Otherwise, if the act is a test act:
      else if (type === 'test') {
        // Add a description of the tool to the act.
        act.what = tools[act.which];
        // Get the start time of the act.
        const startTime = Date.now();
        // Add it to the act.
        act.startTime = startTime;
        // Assign the act to the current checkpoint (0, the launch page, unless checkpoint acts
        // have created later ones), which the child reads as report.activeCheckpoint.
        if (tempReport.checkpoints) {
          const ownTarget = Boolean(act.launch?.target?.url || act.target?.url);
          // If interaction acts have run since the last checkpoint:
          if (dirtySince.length) {
            // In checkpoint mode, make an implicit checkpoint so the act tests the current state.
            if (checkpointMode && page && ! ownTarget) {
              addWarning(
                `Implicit checkpoint before act ${actIndex}; add an explicit checkpoint act`
              );
              await checkpointNow(`act${actIndex}`, actIndex, true);
            }
            // Otherwise, warn that the act tests the launch page, not the current state.
            else if (! ownTarget) {
              addWarning(
                `Test act ${actIndex} follows interaction acts but tests checkpoint 0; add a checkpoint act to test the current page state`
              );
            }
          }
          // A test act with its own target tests that target, outside the checkpoints.
          act.checkpoint = ownTarget ? null : tempReport.checkpoints.length - 1;
          tempReport.activeCheckpoint = act.checkpoint;
          if (act.checkpoint !== null) {
            tempReport.checkpoints[act.checkpoint].testActs.push(actIndex);
          }
        }
        // If the tool tests a URL and the checkpoint was reached by interaction, it cannot
        // observe the checkpoint: prevent the act with the reason.
        const activeCheckpoint = tempReport.checkpoints?.[act.checkpoint];
        if (activeCheckpoint && activeCheckpoint.kind === 'interaction') {
          const testsURL = toolInputs[act.which] === 'url'
          || (['nuVal', 'nuVnu'].includes(act.which) && act.withSource);
          if (testsURL) {
            const reason = `Tool ${act.which} tests a URL, not a page state reached by interaction (checkpoint ${act.checkpoint})`;
            act.data = {prevented: true, error: reason};
            act.result = standard !== 'no'
              ? {standardResult: {... getStandardResult(), prevented: true}}
              : {};
            tempReport.jobData.preventions[act.which] = reason;
            addError(true, false, tempReport, actIndex, `ERROR: ${reason}`);
            act.endTime = Date.now();
            actCount++;
            continue;
          }
        }
        let timedOut = false;
        const limitMs = applyMultiplier(1000 * (timeLimits[act.which] || 15));
        // If test acts run in child processes:
        if (isolation === 'process') {
          let tempReportJSON = JSON.stringify(tempReport);
          // Save a copy of the temporary report, which the child process will read.
          await fs.writeFile(reportPath, tempReportJSON);
          const limitMs = applyMultiplier(1000 * (timeLimits[act.which] || 15));
          const actResult = await new Promise(resolve => {
            let closed = false;
            // Create a child process to perform the act.
            const child = fork(`${__dirname}/doTestAct`, [reportPath, actIndex]);
            let killTimer = null;
            // Start a timeout timer for the child process.
            const timeoutTimer = setTimeout(() => {
              if (! timedOut) {
                timedOut = true;
                console.log(`ERROR: Timed out at ${Math.round(limitMs / 1000)} seconds`);
                child.kill('SIGTERM');
                killTimer = setTimeout(() => {
                  if (! closed) {
                    console.log('ERROR: Failed to exit on SIGTERM from parent');
                  }
                  child.kill('SIGKILL');
                }, 2000);
              }
            }, limitMs);
            // Clears any current timers.
            const clearTimers = () => {
              [timeoutTimer, killTimer].forEach(timer => {
                if (timer) {
                  clearTimeout(timer);
                }
              });
            };
            // If the child process sends a message (normally Act completed):
            child.on('message', message => {
              if (! closed) {
                closed = true;
                clearTimers();
                // Return the message.
                resolve({
                  kind: 'message',
                  message
                });
              }
            });
            // If the child process sends an error:
            child.on('error', error => {
              if (! closed) {
                closed = true;
                clearTimers();
                // Return the error message.
                resolve({
                  kind: 'error',
                  error: error.message
                });
              }
            });
            // If the child process closes:
            child.on('close', (code, signal) => {
              if (! closed) {
                closed = true;
                clearTimers();
                // Return the exit code, signal, and timeout status.
                resolve({
                  kind: 'close',
                  code,
                  signal,
                  timedOut
                });
              }
            });
          });
          // If the child process sent a message:
          if (actResult.kind === 'message') {
            // Get the revised tempReport file.
            tempReportJSON = await fs.readFile(reportPath, 'utf8');
            try {
              // Reassign it to the temporary report.
              tempReport = JSON.parse(tempReportJSON);
              // Redefine the acts as those in the revised temporary report.
              ({acts} = tempReport);
            }
            // If the reassignment fails, leaving the temporary report and its acts unchanged:
            catch (error) {
              // Report this.
              console.log(
                `ERROR: Tool sent message ${actResult.message}. Report is no longer JSON (${error.message}) but is instead a(n) ${typeof tempReportJSON} of length ${tempReportJSON.length}:\n${tempReportJSON}`
              );
              // Report this and that the job was aborted.
              addError(
                false,
                true,
                tempReport,
                actIndex,
                `Non-JSON temporary report file after message ${actResult.message}`
              );
              // Stop processing acts.
              break;
            }
          }
          // Otherwise, i.e. if the child process closed abnormally:
          else {
            // Report this and, if so configured, that the job was aborted.
            const {code, error, kind, signal} = actResult;
            if (kind === 'close' && timedOut) {
              addError(
                false,
                abortAssertively,
                tempReport,
                actIndex,
                `Timed out at ${Math.round(limitMs / 1000)} seconds`
              );
            }
            else if (kind === 'close') {
              addError(
                true,
                abortAssertively,
                tempReport,
                actIndex,
                `Closed with code ${code} and signal ${signal})`
              );
            }
            else {
              addError(
                true, abortAssertively, tempReport, actIndex, `Terminated with error ${error}`
              );
            }
            // If the job was aborted:
            if (abortAssertively) {
              // Stop processing acts.
              break;
            }
          }
        }
        // Otherwise, i.e. if test acts run in this process (browser or page isolation):
        else {
          // Perform the act on the live page (page isolation) or a fresh context, within the
          // time limit. A tool that overruns cannot be killed in-process; the act is reported
          // as timed out and the job continues.
          let timer;
          const timeout = new Promise(resolve => {
            timer = setTimeout(() => {
              timedOut = true;
              resolve('timedOut');
            }, limitMs);
          });
          try {
            await Promise.race([
              performTestAct({report: tempReport, actIndex, livePage: isolation === 'page' ? page : null}),
              timeout
            ]);
          }
          catch(error) {
            addError(true, abortAssertively, tempReport, actIndex, `Tool failed (${error.message.slice(0, 200)})`);
          }
          clearTimeout(timer);
          if (timedOut) {
            addError(
              false,
              abortAssertively,
              tempReport,
              actIndex,
              `Timed out at ${Math.round(limitMs / 1000)} seconds`
            );
          }
          if (abortAssertively && tempReport.jobData.aborted) {
            break;
          }
        }
        // Get the (usually revised) act.
        act = acts[actIndex];
        // Stamp the act's checkpoint on its standard instances.
        if (act.checkpoint !== undefined) {
          (act.result?.standardResult?.instances ?? []).forEach(instance => {
            instance.checkpoint = act.checkpoint;
          });
        }
        // Add the elapsed time of the tool to the temporary report.
        const time = Math.round((Date.now() - startTime) / 1000);
        const {toolTimes} = tempReport.jobData;
        toolTimes[act.which] ??= 0;
        toolTimes[act.which] += time;
        // If the act was not prevented:
        if (act.data && ! act.data.prevented) {
          const expectations = act.expect;
          // If the act has expectations:
          if (expectations) {
            // Initialize whether they were fulfilled.
            act.expectations = [];
            let failureCount = 0;
            // For each expectation:
            expectations.forEach(spec => {
              // Add its result to the act.
              const truth = isTrue(act, spec, tempReport.catalog);
              act.expectations.push({
                property: spec[0],
                relation: spec[1],
                criterion: spec[2],
                actual: truth[0],
                passed: truth[1]
              });
              if (! truth[1]) {
                failureCount++;
              }
            });
            act.expectationFailures = failureCount;
          }
        }
        // #44: signal test-act completion with its outcome — timedOut is the
        // most useful, since doActs already SIGKILLs a timed-out child — and its
        // elapsed time, so consumers need not re-derive them from the report.
        emitProgress({
          event: 'actEnd',
          index: actIndex,
          type,
          which,
          checkpoint: act.checkpoint,
          outcome: timedOut
            ? 'timedOut'
            : act.data && act.data.prevented ? 'prevented' : 'success',
          elapsedMs: Date.now() - startTime
        });
      }
      // Otherwise, if a current page exists:
      else if (page) {
        // Perform the act on it (a page act replaces the page).
        page = await doInteractionAct({page, report: tempReport, act, actIndex, actCount, interaction});
        // Record the act for checkpoints: a successful url act is a navigation; a move, key
        // press, revelation, or tab switch is an interaction the next checkpoint must replay.
        if (type === 'url' && act.result?.success) {
          lastNavURL = page.url();
          sinceNav = [];
          const latest = tempReport.checkpoints?.at(-1);
          if (latest && page.url() !== latest.url) {
            dirtySince.push(actIndex);
          }
        }
        else if (['wait', 'state', 'shoot'].includes(type)) {
          // These observe or record; they change nothing that a replay must repeat.
        }
        else if (act.result && act.result.success !== false) {
          sinceNav.push(actIndex);
          dirtySince.push(actIndex);
        }
      }
      // Otherwise, i.e. if no page exists:
      else {
        // Report this.
        addError(true, false, tempReport, actIndex, 'ERROR: No page identified');
      }
      // Add the end time to the act.
      act.endTime = Date.now();
      // Increment the act count.
      actCount++;
    }
  }
  console.log('Acts completed');
  // Close any browser shared by the job's launches.
  await closeSharedBrowser();
  // If the results were standardized:
  if (['also', 'only'].includes(standard)) {
    // If the native results are not to be included in the report:
    if (standard === 'only') {
      // Remove them.
      tempReport.acts.forEach(act => {
        if (act.result?.nativeResult) {
          delete act.result.nativeResult;
        }
      });
    }
    // If a catalog was created:
    if (tempReport.catalog) {
      let {catalog} = tempReport;
      // Get its element count.
      const elementCount = Object.keys(catalog).length;
      // Prune it, removing elements with no reported violations.
      pruneCatalog(tempReport);
      ({catalog} = tempReport);
      // Get properties of the pruned catalog.
      const textCount = Object.values(catalog).filter(entry => entry.text).length;
      const linkableTextCount = Object.values(catalog).filter(entry => entry.textLinkable).length;
      const entryCount = Object.keys(catalog).length;
      // Initialize a collection of data on it.
      const catalogData = {
        elementCount,
        entryCount,
        checkpoints: {},
        text: {
          count: textCount,
          countPercent: Math.round(100 * textCount / entryCount),
          linkableCount: linkableTextCount,
          linkablePercent: Math.round(100 * linkableTextCount / textCount)
        },
        tools: {}
      };
      // For each checkpoint, count its catalog entries before and after pruning.
      (tempReport.checkpoints ?? []).forEach(checkpoint => {
        catalogData.checkpoints[checkpoint.index] = {
          elementCount: checkpoint.elementCount,
          entryCount: Object.values(catalog).filter(entry => entry.checkpoint === checkpoint.index).length
        };
      });
      const {acts} = tempReport;
      // For each act:
      for (const act of acts) {
        // If it is a test act:
        if (act.type === 'test') {
          const {which} = act;
          // Initialize an entry for it if necessary.
          catalogData.tools[which] ??= {
            instanceCount: 0,
            catalogCount: 0,
            catalogPercent: null
          };
          const actCatalogData = catalogData.tools[which];
          const instances = act.result?.standardResult?.instances ?? [];
          // For each standard instance in the act:
          for (const instance of instances) {
            // Increment the instance count.
            actCatalogData.instanceCount++;
            const catalogIndex = instance?.catalogIndex;
            // If the instance has a catalog index (an index of '0' counts):
            if (catalogIndex !== undefined && catalogIndex !== '') {
              // Increment the catalog count.
              actCatalogData.catalogCount++;
            }
          }
          const {catalogCount, instanceCount} = actCatalogData;
          // If there are any instances:
          if (instanceCount) {
            // Add the catalog percentage to the tool data.
            actCatalogData.catalogPercent = Math.round(100 * catalogCount / instanceCount);
          }
        }
      }
      // Add the catalog data to the temporary report.
      tempReport.jobData.catalogData = catalogData;
    }
  }
  // Delete the temporary temporary report file.
  await fs.rm(reportPath, {force: true});
  // Return the temporary report.
  return tempReport;
};
