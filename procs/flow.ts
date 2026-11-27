/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import {diffLines} from 'diff';
import {getStructureDiff} from './scope';
import type {
  AriaDiff, Catalog, Flow, FlowDelta, FlowIssue, Report, ScopeData, StandardInstance, ToolID
} from '../types';

/*
  flow
  Builds report.flow: the running list of issues across a job's checkpoints. For each pair of
  consecutive checkpoints it records which issues were added, persisted, and removed by the
  acts between them, together with a structure diff of the two catalogs and a line diff of
  the two ARIA snapshots. See docs/checkpoint-scanning.md (Phase 2). Runs on the unpruned
  catalog at job end, and can run on a stored report whose catalog was pruned (the structure
  diff then covers cited elements only). Compiled to flow.js by tsc (issue #73); edit this
  file, not the emitted one.
*/

// TYPES

// The identity of an issue across checkpoints.
interface IssueIdentity {
  tool: ToolID;
  ruleID: string;
  pathID: string;
  startTag: string;
  key: string;
}
// What a checkpoint's test acts observed.
interface CheckpointIssues {
  issues: Record<string, FlowIssue>;
  tools: Set<ToolID>;
  scopedRoots: Partial<Record<ToolID, string[]>>;
}

// CONSTANTS

// The most changed lines an ARIA snapshot diff records.
const maxAriaChanges = 500;

// FUNCTIONS

/*
  Returns the identity of a standard instance for comparison across checkpoints:
  tool, rule, element XPath, and start tag. The catalog index differs per checkpoint for the
  same element, so the XPath stands for the element; the start tag distinguishes a replaced
  element at the same path. Box and text are excluded because layout and copy shift without
  the defect changing. A summary instance (no element) has an empty element key.
*/
const getIdentity = (tool: ToolID, instance: StandardInstance, catalog: Catalog): IssueIdentity => {
  const entry = instance.catalogIndex !== undefined && instance.catalogIndex !== ''
    ? catalog[String(instance.catalogIndex)]
    : null;
  const pathID = entry ? entry.pathID ?? '' : instance.pathID ?? '';
  const startTag = entry ? entry.startTag ?? '' : '';
  return {
    tool,
    ruleID: instance.ruleID,
    pathID,
    startTag,
    key: [tool, instance.ruleID, pathID, startTag].join('|')
  };
};
// Returns whether an XPath is one of, or inside one of, the given root XPaths.
const isWithin = (pathID: string, roots: string[]): boolean => roots.some(
  root => pathID === root || pathID.startsWith(`${root}/`)
);
/*
  Returns the issues found at a checkpoint, keyed by identity; the tools that observed it;
  and, for each tool whose every act at the checkpoint was scoped to changed subtrees, the
  XPaths of those subtrees (scopedRoots), since such a tool observed nothing outside them.
*/
const getCheckpointIssues = (report: Report, checkpointIndex: number): CheckpointIssues => {
  const catalog = report.catalog ?? {};
  const issues: Record<string, FlowIssue> = {};
  const tools = new Set<ToolID>();
  const unscopedTools = new Set<ToolID>();
  const scopedRoots: Partial<Record<ToolID, string[]>> = {};
  report.acts.forEach((act, actIndex) => {
    if (act.type !== 'test' || act.checkpoint !== checkpointIndex) {
      return;
    }
    // A prevented act observed nothing.
    if (act.data && act.data.prevented) {
      return;
    }
    const standardResult = act.result && act.result.standardResult;
    if (! standardResult || standardResult.prevented) {
      return;
    }
    // A test act's which is a tool ID.
    tools.add(act.which as ToolID);
    const scope = act.data && act.data.scope as ScopeData | undefined;
    if (scope && scope.applied) {
      scopedRoots[act.which as ToolID] = [... (scopedRoots[act.which as ToolID] ?? []), ... (scope.pathIDs ?? [])];
    }
    else {
      unscopedTools.add(act.which as ToolID);
    }
    (standardResult.instances ?? []).forEach(instance => {
      const identity = getIdentity(act.which as ToolID, instance, catalog);
      const issue = issues[identity.key] ??= {
        tool: identity.tool,
        ruleID: identity.ruleID,
        pathID: identity.pathID,
        startTag: identity.startTag,
        what: instance.what,
        ordinalSeverity: instance.ordinalSeverity,
        outcome: instance.outcome,
        count: 0,
        actIndexes: []
      };
      issue.count += instance.count || 1;
      if (! issue.actIndexes.includes(actIndex)) {
        issue.actIndexes.push(actIndex);
      }
    });
  });
  unscopedTools.forEach(tool => {
    delete scopedRoots[tool];
  });
  return {issues, tools, scopedRoots};
};
// Returns a string ending with a newline, so the last line of a snapshot compares as a line.
const withFinalNewline = (text: string): string => text && ! text.endsWith('\n') ? `${text}\n` : text;
// Returns a line diff of two ARIA snapshots (absent from a stored report without them).
const getAriaDiff = (before: string | undefined, after: string | undefined): AriaDiff => {
  const changes: AriaDiff['changes'] = [];
  let addedLineCount = 0;
  let removedLineCount = 0;
  let truncated = false;
  let line = 0;
  diffLines(withFinalNewline(before ?? ''), withFinalNewline(after ?? '')).forEach(part => {
    const lines = part.value.replace(/\n$/, '').split('\n');
    if (part.added) {
      addedLineCount += lines.length;
    }
    else if (part.removed) {
      removedLineCount += lines.length;
    }
    if (part.added || part.removed) {
      lines.forEach(text => {
        if (changes.length < maxAriaChanges) {
          changes.push({type: part.added ? 'added' : 'removed', line, text});
        }
        else {
          truncated = true;
        }
        if (part.added) {
          line++;
        }
      });
    }
    else {
      line += lines.length;
    }
  });
  return {addedLineCount, removedLineCount, truncated, changes};
};
/*
  Builds and returns the flow of a report, or null if the report has fewer than two
  checkpoints. For each pair of consecutive checkpoints, the issues of the tools that observed
  both are compared: added (only at the later), persisted (at both), removed (only at the
  earlier). Tools that observed only one of the two are listed as notObserved, since their
  issues cannot be compared. An earlier issue that a tool did not re-test at the later
  checkpoint, because its acts there were all scoped to changed subtrees and the issue's
  element lies outside them, is listed as notRetested rather than removed.
*/
export const getFlow = (report: Report): Flow | null => {
  const checkpoints = report.checkpoints ?? [];
  if (checkpoints.length < 2) {
    return null;
  }
  const observations = checkpoints.map(checkpoint => getCheckpointIssues(report, checkpoint.index));
  const summaries: Flow['checkpoints'] = checkpoints.map((checkpoint, index) => {
    const {issues, tools} = observations[index];
    return {
      index: checkpoint.index,
      name: checkpoint.name,
      kind: checkpoint.kind,
      url: checkpoint.url,
      actIndex: checkpoint.actIndex,
      testActs: checkpoint.testActs,
      tools: Array.from(tools).sort(),
      issueCount: Object.keys(issues).length
    };
  });
  const deltas: FlowDelta[] = [];
  for (let index = 1; index < checkpoints.length; index++) {
    const before = observations[index - 1];
    const after = observations[index];
    const tools = Array.from(before.tools).filter(tool => after.tools.has(tool)).sort();
    const notObserved = Array.from(new Set([... before.tools, ... after.tools]))
    .filter(tool => ! tools.includes(tool))
    .sort();
    const comparable = (issue: FlowIssue): boolean => tools.includes(issue.tool);
    const added: FlowIssue[] = [];
    const persisted: FlowIssue[] = [];
    const removed: FlowIssue[] = [];
    const notRetested: FlowIssue[] = [];
    Object.keys(after.issues).forEach(key => {
      const issue = after.issues[key];
      if (comparable(issue)) {
        (before.issues[key] ? persisted : added).push(issue);
      }
    });
    Object.keys(before.issues).forEach(key => {
      const issue = before.issues[key];
      if (comparable(issue) && ! after.issues[key]) {
        const roots = after.scopedRoots[issue.tool];
        const retested = ! roots || (issue.pathID && isWithin(issue.pathID, roots));
        (retested ? removed : notRetested).push(issue);
      }
    });
    // The structure diff recorded when the checkpoint was made, else one computed now (on a
    // stored report, over the cited entries only).
    const structure = checkpoints[index].structure
      ?? getStructureDiff(report, checkpoints[index - 1].index, checkpoints[index].index);
    deltas.push({
      from: checkpoints[index - 1].index,
      to: checkpoints[index].index,
      tools,
      notObserved,
      added,
      persisted,
      removed,
      notRetested,
      structure,
      aria: getAriaDiff(checkpoints[index - 1].ariaSnapshot, checkpoints[index].ariaSnapshot)
    });
  }
  return {checkpoints: summaries, deltas};
};
