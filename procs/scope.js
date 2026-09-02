/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  scope.js
  Finds what changed between two checkpoints of a report, by comparing their catalog entries,
  and reduces the changes to the smallest set of subtree roots that contains them. The roots
  serve test acts with scope: 'changed' (docs/checkpoint-scanning.md, Phase 3) and the
  structure diffs of report.flow (Phase 2).
*/

// CONSTANTS

// The most roots a changed-scope test act may be given; above this, the whole page is tested.
const maxRoots = exports.maxRoots = 50;

// FUNCTIONS

// Returns whether one XPath (as the catalog records them) is a strict descendant of another.
const isDescendant = (pathID, ancestorPathID) => pathID.startsWith(`${ancestorPathID}/`);
// Returns the XPath of the parent of an element, or '' for the root.
const parentOf = pathID => pathID.slice(0, pathID.lastIndexOf('/')) || '';
// Returns the catalog entries of a checkpoint, keyed by XPath.
const getEntriesByPath = (report, checkpointIndex) => {
  const entries = {};
  const checkpoint = (report.checkpoints ?? [])[checkpointIndex];
  const range = checkpoint && checkpoint.catalogRange;
  const catalog = report.catalog ?? {};
  // Read the checkpoint's index range if recorded, else every entry stamped with the checkpoint.
  const keys = range
    ? Array.from({length: range[1] - range[0] + 1}, (_, offset) => String(range[0] + offset))
    : Object.keys(catalog).filter(key => catalog[key].checkpoint === checkpointIndex);
  keys.forEach(key => {
    const entry = catalog[key];
    if (entry && entry.pathID && entry.checkpoint === checkpointIndex) {
      entries[entry.pathID] = entry;
    }
  });
  return entries;
};
/*
  Converts an XPath of the form the catalog records (/html/body/main[1]/div[2]) to a CSS
  selector (html > body > main:nth-of-type(1) > div:nth-of-type(2)). The conversion is exact
  because window.getXPath subscripts each element among its same-tag siblings, which is what
  nth-of-type counts. Returns '' if the XPath has an unexpected shape.
*/
const xPathToSelector = exports.xPathToSelector = pathID => {
  if (typeof pathID !== 'string' || ! pathID.startsWith('/')) {
    return '';
  }
  const segments = pathID.slice(1).split('/');
  const parts = [];
  for (const segment of segments) {
    const match = segment.match(/^([a-z][a-z0-9-]*)(?:\[(\d+)\])?$/);
    if (! match) {
      return '';
    }
    parts.push(match[2] ? `${match[1]}:nth-of-type(${match[2]})` : match[1]);
  }
  return parts.join(' > ');
};
/*
  Compares the catalog entries of two checkpoints and returns the difference:
    added: XPaths present only in the later checkpoint
    removed: XPaths present only in the earlier one
    changed: XPaths present in both whose start tags differ
    textChanged: XPaths present in both, with the same start tag, whose text differs
    roots: the smallest set of XPaths, in the later checkpoint, whose subtrees contain every
      change (the parent of a removed element stands for it; a text change counts only where
      no descendant changed, because the catalog text of an element includes its descendants')
    counts: the sizes of the above
*/
const getStructureDiff = exports.getStructureDiff = (report, fromIndex, toIndex) => {
  const before = getEntriesByPath(report, fromIndex);
  const after = getEntriesByPath(report, toIndex);
  const added = [];
  const removed = [];
  const changed = [];
  const textChanged = [];
  Object.keys(after).forEach(pathID => {
    const entry = after[pathID];
    const priorEntry = before[pathID];
    if (! priorEntry) {
      added.push(pathID);
    }
    else if ((priorEntry.startTag ?? '') !== (entry.startTag ?? '')) {
      changed.push(pathID);
    }
    else if ((priorEntry.text ?? '') !== (entry.text ?? '')) {
      textChanged.push(pathID);
    }
  });
  Object.keys(before).forEach(pathID => {
    if (! after[pathID]) {
      removed.push(pathID);
    }
  });
  // Elements whose own change (not their descendants') marks them as changed.
  const structural = new Set([... added, ... changed]);
  removed.forEach(pathID => {
    // The nearest surviving ancestor stands for a removed element.
    let ancestor = parentOf(pathID);
    while (ancestor && ! after[ancestor]) {
      ancestor = parentOf(ancestor);
    }
    if (ancestor) {
      structural.add(ancestor);
    }
  });
  const allChanged = new Set([... structural, ... textChanged]);
  // A text change counts only where no descendant changed at all.
  textChanged.forEach(pathID => {
    const hasChangedDescendant = Array.from(allChanged).some(other => isDescendant(other, pathID));
    if (! hasChangedDescendant) {
      structural.add(pathID);
    }
  });
  // Collapse the changed elements to their outermost members.
  const roots = Array.from(structural)
  .filter(pathID => ! Array.from(structural).some(other => other !== pathID && isDescendant(pathID, other)))
  .sort();
  return {
    added,
    removed,
    changed,
    textChanged,
    roots,
    counts: {
      before: Object.keys(before).length,
      after: Object.keys(after).length,
      added: added.length,
      removed: removed.length,
      changed: changed.length,
      textChanged: textChanged.length,
      roots: roots.length
    }
  };
};
// Returns the XPath of the nearest common ancestor-or-self of XPaths.
const getCommonAncestor = exports.getCommonAncestor = pathIDs => {
  if (! pathIDs.length) {
    return '';
  }
  let common = pathIDs[0].split('/');
  pathIDs.slice(1).forEach(pathID => {
    const segments = pathID.split('/');
    let length = 0;
    while (length < common.length && length < segments.length && common[length] === segments[length]) {
      length++;
    }
    common = common.slice(0, length);
  });
  return common.join('/') || '/html';
};
/*
  Returns the subtree roots a changed-scope test act at a checkpoint is to test: the CSS
  selectors of the roots of the structure diff between the checkpoint and the previous one.
  applied is false, with a reason, when the act cannot be scoped: no previous checkpoint, no
  change at all, too many roots (maxRoots), or a root whose XPath cannot become a selector.
*/
exports.getChangedRoots = (report, checkpointIndex) => {
  if (! Number.isInteger(checkpointIndex) || checkpointIndex < 1) {
    return {applied: false, reason: 'no previous checkpoint to compare', roots: [], pathIDs: []};
  }
  // Use the diff recorded when the checkpoint was made (the previous checkpoint's uncited
  // entries were pruned then), else compute it.
  const checkpoint = (report.checkpoints ?? [])[checkpointIndex];
  const diff = checkpoint && checkpoint.structure
    ? checkpoint.structure
    : getStructureDiff(report, checkpointIndex - 1, checkpointIndex);
  const {roots: pathIDs} = diff;
  if (! pathIDs.length) {
    return {applied: false, reason: 'no change since the previous checkpoint', roots: [], pathIDs};
  }
  if (pathIDs.length > maxRoots) {
    return {
      applied: false,
      reason: `${pathIDs.length} changed subtrees exceed the limit of ${maxRoots}`,
      roots: [],
      pathIDs
    };
  }
  const roots = pathIDs.map(xPathToSelector);
  if (roots.some(root => ! root)) {
    return {applied: false, reason: 'a changed subtree has no CSS selector', roots: [], pathIDs};
  }
  // The nearest ancestor of all the roots, for tools that take one root only.
  const commonPathID = getCommonAncestor(pathIDs);
  return {applied: true, reason: '', roots, pathIDs, commonRoot: xPathToSelector(commonPathID)};
};
