/*
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  types
  Type declarations for the shapes Testaro produces and consumes.

  Since Phase 1 of the TypeScript migration (issue #73) this is a TypeScript
  source file; types.d.ts and types.js are generated from it by tsc and
  committed. These describe the report as it exists today; where the runtime is
  looser than a type can promise, the property is optional or unknown rather
  than aspirational. The Act type is deliberately permissive in this phase; the
  discriminated union over act types arrives when procs/job.js is converted.
*/

// The tools whose adapters ship with Testaro (the keys of the tools map in procs/job.js).
export type ToolID =
  | 'alfa'
  | 'aslint'
  | 'axe'
  | 'ed11y'
  | 'htmlcs'
  | 'ibm'
  | 'nuVal'
  | 'nuVnu'
  | 'pour'
  | 'qualWeb'
  | 'surea11y'
  | 'testaro'
  | 'wave';

// Whether a rule engine asserted a violation or reported that it could not tell (ACT vocabulary).
export type Outcome = 'failed' | 'cantTell';

// Reasons a rule engine may give for a cantTell outcome.
export type UncertaintyCode =
  | 'not-computable'
  | 'judgement-required'
  | 'runtime-dependent'
  | 'spec-only'
  | 'equivalence-unknown'
  | 'out-of-scope';

// The browser types a job may specify.
export type BrowserID = 'chromium' | 'firefox' | 'webkit';

// Rule-violation counts at the 4 ordinal severities, least severe first.
export type SeverityTotals = [number, number, number, number];

// One violation (or group of violations of one rule) in a standard result.
export interface StandardInstance {
  ruleID: string;
  what: string;
  ordinalSeverity: 0 | 1 | 2 | 3;
  // Certainty of the violation (v78.1+ reports); the authoritative certainty signal.
  outcome?: Outcome;
  // Reason for a cantTell outcome, if the rule engine gave one.
  uncertainty?: UncertaintyCode;
  // What a reviewer must determine to resolve a cantTell outcome, if the rule engine said.
  needed?: string;
  count?: number;
  // Key of the violating element in the report catalog (v70+ reports).
  catalogIndex?: string | number;
  // Index of the checkpoint (page state) the instance was found in (v78.2+ reports).
  checkpoint?: number;
  // Inline element identifiers of pre-catalog (v60) reports; absent on v70+.
  tagName?: string;
  id?: string;
  location?: {
    doc: string;
    type: 'selector' | 'xpath' | 'box' | '';
    spec: string | string[] | BoundingBox | Record<string, never>;
  };
  boxID?: string;
  pathID?: string;
  excerpt?: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// The Testaro-standardized result of one test act.
export interface StandardResult {
  prevented?: boolean;
  totals?: SeverityTotals;
  // Counts of violations by outcome (v78.1+ reports).
  outcomeTotals?: Record<Outcome, number>;
  instances?: StandardInstance[];
}

/*
  One entry per element in the report catalog (v70+). getCatalog writes all 8
  properties; getXPathCatalogIndex appends stub entries carrying only tagName
  and pathID when a test cites an element the catalog pass did not record, so
  only those 2 properties can be promised.
*/
export interface CatalogEntry {
  tagName: string;
  pathID: string;
  id?: string;
  startTag?: string;
  text?: string;
  textLinkable?: boolean;
  boxID?: string;
  headingIndex?: string;
  // Index of the checkpoint (page state) whose snapshot the entry belongs to.
  checkpoint?: number;
}

// The element catalog: element index (stringified integer) to entry.
export type Catalog = Record<string, CatalogEntry>;

// The event modality of interaction acts; only 'efficient' exists today.
export interface Interaction {
  modality: 'efficient';
}

/*
  A checkpoint: a page state reached by the job's serial acts, snapshotted (catalog, page
  image, ARIA snapshot) and tested by the test acts that follow it. Checkpoint 0 is the job
  target as launched; a checkpoint act creates each later one. A navigation checkpoint was
  reached by navigation alone and needs no replay; an interaction checkpoint was reached by
  acts on a page, which a test act's browser replays after navigating to launchURL.
*/
export interface Checkpoint {
  index: number;
  name: string;
  implicit: boolean;
  actIndex: number | null;
  launchActIndex: number | null;
  launchURL: string;
  replay: number[];
  interaction: Interaction;
  kind: 'navigation' | 'interaction';
  url: string;
  title: string;
  imageIndexes: number[];
  catalogRange: [number, number] | null;
  elementCount: number;
  ariaSnapshot: string;
  domDigest?: string;
  elapsedMs: number;
  testActs: number[];
  // Job-time: the structure diff with the previous checkpoint, moved into report.flow at job end.
  structure?: StructureDiff;
}

// One act of a job. Permissive in Phase 0; see the file comment.
export interface Act {
  type: string;
  which?: string;
  what?: string;
  startTime?: string;
  endTime?: string;
  actualURL?: string;
  data?: Record<string, unknown>;
  result?: {
    nativeResult?: unknown;
    standardResult?: StandardResult;
    [key: string]: unknown;
  };
  expectations?: unknown;
  expectationFailures?: number;
  // The checkpoint a test act belongs to, assigned by doActs.
  checkpoint?: number | null;
  // What a test act tests: its checkpoint's whole page (default) or the subtrees changed
  // since the previous checkpoint (for the rules and tools that can be so restricted).
  scope?: TestScope;
  [key: string]: unknown;
}

// The scope of a test act.
export type TestScope = 'page' | 'changed';

// What a changed-scope test act was given, recorded as act.data.scope.
export interface ScopeData {
  requested: TestScope;
  // Whether the tool restricted its tests to the roots.
  applied: boolean;
  // Why not, if not.
  reason: string;
  // CSS selectors of the changed subtree roots, and their XPaths.
  roots: string[];
  pathIDs: string[];
  // A selector of the nearest common ancestor of the roots, for tools that take one root.
  commonRoot?: string;
  // For the testaro tool: which of its rules were scoped to the roots and which tested the page.
  localRules?: string[];
  pageRules?: string[];
}

// An issue found at a checkpoint, identified across checkpoints by tool, rule, element XPath,
// and start tag (report.flow).
export interface FlowIssue {
  tool: ToolID;
  ruleID: string;
  pathID: string;
  startTag: string;
  what: string;
  ordinalSeverity: number;
  outcome?: Outcome;
  count: number;
  actIndexes: number[];
}

// The difference between the catalogs of two checkpoints, as XPaths.
export interface StructureDiff {
  added: string[];
  removed: string[];
  changed: string[];
  textChanged: string[];
  // The outermost changed elements, whose subtrees contain every change.
  roots: string[];
  counts: Record<'before' | 'after' | 'added' | 'removed' | 'changed' | 'textChanged' | 'roots', number>;
}

// The line difference between the ARIA snapshots of two checkpoints.
export interface AriaDiff {
  addedLineCount: number;
  removedLineCount: number;
  truncated: boolean;
  changes: {type: 'added' | 'removed'; line: number; text: string}[];
}

// What changed between two consecutive checkpoints: issues and page structure.
export interface FlowDelta {
  from: number;
  to: number;
  // Tools that observed both checkpoints, whose issues are compared.
  tools: ToolID[];
  // Tools that observed only one of the two.
  notObserved: ToolID[];
  added: FlowIssue[];
  persisted: FlowIssue[];
  removed: FlowIssue[];
  // Earlier issues outside the changed subtrees a tool's later acts were all scoped to.
  notRetested: FlowIssue[];
  structure: StructureDiff;
  aria: AriaDiff;
}

// The running list of issues across a job's checkpoints (reports with 2 or more checkpoints).
export interface Flow {
  checkpoints: {
    index: number;
    name: string;
    kind: Checkpoint['kind'];
    url: string;
    actIndex: number | null;
    testActs: number[];
    tools: ToolID[];
    issueCount: number;
  }[];
  deltas: FlowDelta[];
}

// A job before execution and the report it becomes during and after execution.
export interface Report {
  id: string;
  what?: string;
  strict?: boolean;
  standard?: 'also' | 'only' | 'no';
  observe?: boolean;
  browserID?: BrowserID;
  device?: {id: string; windowOptions?: Record<string, unknown>};
  target?: {
    what?: string;
    url: string;
  };
  sources?: Record<string, unknown>;
  creationTimeStamp?: string;
  executionTimeStamp?: string;
  timeLimit?: number;
  acts: Act[];
  // The severity of required page-image colorfulness; even values require an image.
  imageColor?: number;
  // Page-image scale factor; values greater than 1 add a device-scale image (images[1]).
  imageScale?: number;
  // Whether Chromium runs stealth evasions (default true; Chromium only).
  stealth?: boolean;
  // Branded Chromium channel to run instead of the bundled build (chrome or msedge).
  browserChannel?: 'bundled' | 'chrome' | 'msedge';
  // Scanner identity sent as the X-YRA-Scanner request header (default SCANNER_ID, else none).
  scannerId?: string;
  // Whether to scroll the full page after navigation so lazily loaded content is present
  // (default PRESCAN_SCROLL, else false).
  scroll?: boolean;
  // Navigation options (defaults NAV_WAIT_UNTIL, NAV_TIMEOUT, NAV_FAIL_FAST_4XX, else
  // networkidle, 10000, false).
  navigation?: {
    waitUntil?: 'networkidle' | 'load' | 'domcontentloaded';
    timeout?: number;
    failFast4xx?: boolean;
  };
  // Base64-encoded page images added by shoot with the report action.
  images?: string[];
  // The element catalog, added by getCatalog and pruned before the report ships.
  catalog?: Catalog;
  // The checkpoints (page states) of the job; checkpoint 0 is added by getCatalog.
  checkpoints?: Checkpoint[];
  // Job-time properties, deleted by pruneCatalog: per-checkpoint XPath-to-catalog-index maps,
  // the next unused catalog index, and the checkpoint the current test act belongs to.
  pathIDs?: Record<string, Record<string, string>>;
  catalogNextIndex?: number;
  activeCheckpoint?: number | null;
  // Job-time: the changed subtree roots of the current changed-scope test act, and, within
  // the testaro tool, those of the current rule (null for a page-level rule).
  scope?: {roots: string[]; commonRoot?: string} | null;
  ruleScopeRoots?: string[] | null;
  // The running list of issues across checkpoints, added at job end when there are 2 or more.
  flow?: Flow;
  jobData?: {
    aborted?: boolean;
    abortedAct?: number;
    endTime?: string;
    elapsedSeconds?: number;
    visitLatency?: number;
    logCount?: number;
    logSize?: number;
    errorLogCount?: number;
    errorLogSize?: number;
    prohibitedCount?: number;
    visitRejectionCount?: number;
    visitTimeoutCount?: number;
    preventions?: Partial<Record<ToolID, unknown>>;
    toolTimes?: Partial<Record<ToolID, number>>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/*
  The classification a getBadWhat predicate returns for a candidate element:
  falsy for no violation, a description string for a violation, or an object
  when the violation carries data. A `0:`–`3:` prefix on a description
  overrides the rule's default ordinal severity. Predicates are serialized with
  toString() and rehydrated inside the page, so they must be closure-free; the
  type checker cannot enforce that invariant.
*/
export type BadWhat =
  | null
  | undefined
  | false
  | ''
  | string
  | {description: string; data?: unknown};
export type GetBadWhat = (element: Element) => BadWhat | Promise<BadWhat>;

declare global {
  interface Window {
    // Injected by procs/launch.js for use inside page.evaluate callbacks.
    getXPath: (element: Element) => string | null | undefined;
    getAccessibleName: (element: Element) => string;
    computeAccessibleName: (element: Element) => string;
    getProtoInstance: (element: Element) => unknown;
    // Set by the HTML CodeSniffer bundle while the htmlcs tool runs.
    HTMLCS_WCAG?: unknown;
    HTMLCS_RUNNER?: {run: (standard: string) => string[]};
    // Redefined by the htmlcs tool to limit testing to selected rules.
    HTMLCS_WCAG2AAA?: {sniffs?: unknown};
    // Loader globals the htmlcs tool hides while its UMD bundle executes.
    define?: unknown;
    exports?: unknown;
    module?: unknown;
  }
}
