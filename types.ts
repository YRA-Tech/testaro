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

// Where test acts run: each in a child process, in a browser of its own in the job's process, or
// on the job's live page.
export type IsolationLevel = 'process' | 'browser' | 'page';

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
  // Index of the checkpoint (page state) the instance was found in (v78.2+ reports), or null if
  // its test act had a target of its own, outside the checkpoints.
  checkpoint?: number | null;
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

/*
  The acts of a job as the job specifies them, one type per act type: the properties that
  actSpecs.js validates. (Act, below, is an act in a report, which also carries what its
  performance added.) actSpecs.ts is checked against these types with ActSpecs, so the two
  cannot drift apart (issue #73, hazard 8).
*/
// An optional comment, which most act types allow.
interface Commented {
  what?: string;
}
// Properties that identify the element of a move: a Playwright selector, or the element type
// with a substring of its text and an index among the matches.
interface MoveTarget {
  selector?: string;
  which?: string;
  index?: number;
}
export interface ButtonAct extends MoveTarget, Commented {type: 'button'}
export interface CheckpointAct extends Commented {type: 'checkpoint'; which: string}
export interface CheckboxAct extends MoveTarget, Commented {type: 'checkbox'}
export interface FocusAct {type: 'focus'; what: string; index?: number; which?: string}
export interface LaunchAct extends Commented {
  type: 'launch';
  target?: {what?: string; url?: string};
  browserID?: BrowserID;
  shoot?: {exclusionSelector?: string; colorType?: number; action?: string};
}
export interface LinkAct extends MoveTarget, Commented {type: 'link'}
export interface NextAct extends Commented {
  type: 'next';
  if: Expectation;
  jump?: number;
  // The name property of the act to perform next. Any act may have a name, which no act spec
  // lists and isValidAct does not check.
  next?: string;
}
export interface PageAct extends Commented {type: 'page'}
export interface PressAct extends Commented {type: 'press'; which: string; again?: number}
export interface PressesAct {
  type: 'presses';
  navKey: string;
  what?: string;
  which?: string[];
  text?: string;
  action?: string;
  withItems: boolean;
}
export interface RadioAct extends MoveTarget, Commented {type: 'radio'}
export interface RevealAct extends Commented {type: 'reveal'}
export interface SearchAct extends MoveTarget {type: 'search'; what: string}
export interface SelectAct extends MoveTarget {type: 'select'; what: string}
export interface ShootAct extends Commented {
  type: 'shoot';
  exclusionSelector?: string;
  colorType?: number;
  action: string;
}
export interface StateAct extends Commented {type: 'state'; which: 'loaded' | 'idle'}
export interface TextAct extends MoveTarget {type: 'text'; what: string; clear?: boolean}
export interface URLAct extends Commented {type: 'url'; which: string; id?: string}
export interface WaitAct {type: 'wait'; what: 'url' | 'title' | 'body'; which: string}
// The properties of every test act.
export interface TestActBase {
  type: 'test';
  which: ToolID;
  launch?: {target?: {what?: string; url?: string}; browserID?: BrowserID; what?: string};
  rules?: string[];
  scope?: TestScope;
}
// The properties that particular tools add to a test act.
export interface ToolActProperties {
  axe: {detailLevel: number};
  ibm: {withItems: boolean};
  nuVal: {withSource?: boolean};
  nuVnu: {withSource?: boolean};
  qualWeb: {stealth?: boolean; adBlock?: boolean};
  testaro: {
    withItems: boolean;
    stopOnFail: boolean;
    args?: Record<string, unknown[]>;
    rulesForcedOn?: string[];
    rulesForcedOff?: string[];
    retries?: number;
  };
  wave: {reportType: number; url?: string; prescript?: string; postscript?: string};
}
// A test act of each tool, discriminated by which.
export type TestAct = {
  [T in ToolID]: TestActBase & {which: T} & (T extends keyof ToolActProperties ? ToolActProperties[T] : {});
}[ToolID];
// An act of a job.
export type JobAct =
  | ButtonAct | CheckpointAct | CheckboxAct | FocusAct | LaunchAct | LinkAct | NextAct
  | PageAct | PressAct | PressesAct | RadioAct | RevealAct | SearchAct | SelectAct | ShootAct
  | StateAct | TestAct | TextAct | URLAct | WaitAct;
// The act types.
export type JobActType = JobAct['type'];

// The type of the value of an act property, as actSpecs names it.
export type SpecType = 'string' | 'number' | 'boolean' | 'array' | 'object';
// A further requirement on the value of an act property, as procs/job.js tests it.
export type SpecSubtype =
  | '' | 'hasLength' | 'isURL' | 'isBrowserID' | 'isFocusable' | 'isTest' | 'isWaitable'
  | 'areNumbers' | 'areStrings' | 'areArrays' | 'isState' | 'isScope';
// The spec type of a property value type.
type SpecTypeOf<V> =
  V extends string ? 'string'
  : V extends number ? 'number'
  : V extends boolean ? 'boolean'
  : V extends unknown[] ? 'array'
  : V extends object ? 'object'
  : never;
// The spec of property K of act type A: whether it is required, its type, its subtype, and a
// description. The required flag and the type must agree with A.
type PropSpecFor<A, K extends keyof A> = readonly [
  {} extends Pick<A, K> ? false : true,
  SpecTypeOf<NonNullable<A[K]>>,
  SpecSubtype,
  string
];
// The spec of an act type, or of the properties a tool adds: a description, and a spec for each
// property of A except its type.
type SpecFor<A> = readonly [string, {[K in Exclude<keyof A, 'type'>]: PropSpecFor<A, K>}];
// The act specifications of actSpecs.ts: one per act type, and one per tool that adds properties.
// The spec of the test act covers the properties of TestActBase only.
export interface ActSpecs {
  etc: {[T in Exclude<JobActType, 'test'>]: SpecFor<Extract<JobAct, {type: T}>>} & {
    test: SpecFor<TestActBase>;
  };
  tools: {[T in keyof ToolActProperties]: SpecFor<ToolActProperties[T]>};
}

// A relation of an expectation: equal, less, greater, unequal, includes, excludes, or equal as
// JSON.
export type Relation = '=' | '<' | '>' | '!' | 'i' | '!i' | 'e';
/*
  An expectation of a test act (act.expect) or the condition of a next act (act.if): a property
  path in a.b.c format, alone (the property must not exist) or with a relation and a criterion.
  isTrue (procs/doActs) evaluates it. Nothing validates a test act's expectations.
*/
export type Expectation = [property: string, relation?: Relation, criterion?: unknown];
// Whether a test act fulfilled one of its expectations (act.expectations).
export interface ExpectationResult {
  property: string;
  relation: Relation | undefined;
  criterion: unknown;
  actual: unknown;
  // Undefined if the relation is not one of the relations.
  passed: boolean | undefined;
}

// One act of a job. Permissive in Phase 0; see the file comment.
export interface Act {
  type: string;
  which?: string;
  what?: string;
  // Milliseconds since the epoch, added by doActs.
  startTime?: number;
  endTime?: number;
  actualURL?: string;
  data?: Record<string, unknown>;
  result?: {
    nativeResult?: unknown;
    standardResult?: StandardResult;
    [key: string]: unknown;
  };
  // The expectations of a test act, and whether they were fulfilled.
  expect?: Expectation[];
  expectations?: ExpectationResult[];
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
  // Where test acts run (default ISOLATION, else process).
  isolation?: IsolationLevel;
  // Branded Chromium channel to run instead of the bundled build (chrome or msedge).
  browserChannel?: 'bundled' | 'chrome' | 'msedge';
  // Scanner identity sent as the X-YRA-Scanner request header to the site being tested (default
  // SCANNER_ID, else none).
  scannerId?: string;
  // Whether to scroll the full page after navigation so lazily loaded content is present
  // (default PRESCAN_SCROLL, else false).
  scroll?: boolean;
  // Navigation options (defaults NAV_WAIT_UNTIL, NAV_TIMEOUT, NAV_FAIL_FAST_4XX,
  // NAV_ROTATE_BROWSERS, else networkidle, 10000, false, true).
  navigation?: {
    waitUntil?: 'networkidle' | 'load' | 'domcontentloaded';
    timeout?: number;
    failFast4xx?: boolean;
    rotateBrowsers?: boolean;
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
    // The index of the act during which the job was aborted, or none ('none' after an act that
    // has no index, null if the job was invalid or not aborted).
    abortedAct?: number | 'none' | null;
    // Why and when the job was aborted, if it was.
    abortMessage?: string;
    abortTime?: string;
    startTime?: string;
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
    // The key presses performed and the amount of text read by interaction acts.
    presses?: number;
    amountRead?: number;
    // The job's temporary directory (null if no writable one was found), and where its test acts
    // run.
    tmpDir?: string | null;
    isolation?: IsolationLevel;
    // Warnings about the job's acts, added by doActs.
    warnings?: string[];
    // Counts of the catalog's entries, added by doActs.
    catalogData?: CatalogData;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// Counts of a report's catalog entries before and after pruning (report.jobData.catalogData).
export interface CatalogData {
  // Entries ever made, and entries left after pruning.
  elementCount: number;
  entryCount: number;
  // By checkpoint index.
  checkpoints: Record<number, {elementCount: number; entryCount: number}>;
  // Remaining entries with text and with linkable text. A percentage is NaN (null in the
  // report) if its base is 0.
  text: {count: number; countPercent: number; linkableCount: number; linkablePercent: number};
  // By tool: its standard instances, those with a catalog index, and their percentage (null if
  // the tool reported no instances).
  tools: Partial<Record<ToolID, {
    instanceCount: number;
    catalogCount: number;
    catalogPercent: number | null;
  }>>;
}

// An event that doJob (run.js) reports to an onProgress callback (#44), besides those of doActs.
export type JobProgressEvent =
  | {event: 'jobStart'; id: string}
  | {event: 'catalogStart'}
  | {event: 'catalogEnd'; elapsedMs: number}
  | {event: 'jobEnd'; id: string; aborted: boolean};
// An event that doJob reports to an onProgress callback.
export type ProgressEvent = JobProgressEvent | ActsProgressEvent;
// An event that doActs reports to an onProgress callback (#44).
export type ActsProgressEvent =
  | {event: 'actStart'; index: number; type: string; which: string | undefined}
  | {
    event: 'actEnd';
    index: number;
    type: string;
    which: string | undefined;
    checkpoint: number | null | undefined;
    outcome: 'timedOut' | 'prevented' | 'success';
    elapsedMs: number;
  }
  | {event: 'checkpointStart'; index: number; name: string}
  | {
    event: 'checkpointEnd';
    index: number;
    name: string;
    kind: Checkpoint['kind'];
    elapsedMs: number;
  };

// The message the child process of a test act under process isolation (procs/doTestAct) sends
// its parent (procs/doActs): ok, or an error naming what failed.
export type TestActMessage = {status: 'ok'} | {status: 'error'; error: string};

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
    // A standard proto-instance of a violation of a rule, with the XPath of its element if any.
    getProtoInstance: (
      element: Element | null | undefined,
      ruleID: string,
      what: string,
      count?: number,
      ordinalSeverity?: number,
      summaryTagName?: string,
      outcome?: Outcome
    ) => {
      ruleID: string;
      what: string;
      count: number;
      ordinalSeverity: number | undefined;
      outcome: Outcome;
      pathID?: string | null | undefined;
    };
    // Set by the automation-masking script of procs/launch.js.
    chrome?: {runtime: object};
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
