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
  | 'qualWeb'
  | 'testaro'
  | 'wave';

// The browser types a job may specify.
export type BrowserID = 'chromium' | 'firefox' | 'webkit';

// Rule-violation counts at the 4 ordinal severities, least severe first.
export type SeverityTotals = [number, number, number, number];

// One violation (or group of violations of one rule) in a standard result.
export interface StandardInstance {
  ruleID: string;
  what: string;
  ordinalSeverity: 0 | 1 | 2 | 3;
  count?: number;
  // Key of the violating element in the report catalog (v70+ reports).
  catalogIndex?: string | number;
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
}

// The element catalog: element index (stringified integer) to entry.
export type Catalog = Record<string, CatalogEntry>;

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
  [key: string]: unknown;
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
  // Base64-encoded page images added by shoot with the report action.
  images?: string[];
  // The element catalog, added by getCatalog and pruned before the report ships.
  catalog?: Catalog;
  // XPath-to-catalog-index map, added by getCatalog and deleted by pruneCatalog.
  pathIDs?: Record<string, string>;
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
    HTMLCS_RUNNER?: {run: (standard: string) => void};
  }
}
