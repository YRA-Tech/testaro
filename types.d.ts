export type ToolID = 'alfa' | 'aslint' | 'axe' | 'ed11y' | 'htmlcs' | 'ibm' | 'nuVal' | 'nuVnu' | 'pour' | 'qualWeb' | 'surea11y' | 'testaro' | 'wave';
export type Outcome = 'failed' | 'cantTell';
export type UncertaintyCode = 'not-computable' | 'judgement-required' | 'runtime-dependent' | 'spec-only' | 'equivalence-unknown' | 'out-of-scope';
export type BrowserID = 'chromium' | 'firefox' | 'webkit';
export type SeverityTotals = [number, number, number, number];
export interface StandardInstance {
    ruleID: string;
    what: string;
    ordinalSeverity: 0 | 1 | 2 | 3;
    outcome?: Outcome;
    uncertainty?: UncertaintyCode;
    needed?: string;
    count?: number;
    catalogIndex?: string | number;
    checkpoint?: number;
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
export interface StandardResult {
    prevented?: boolean;
    totals?: SeverityTotals;
    outcomeTotals?: Record<Outcome, number>;
    instances?: StandardInstance[];
}
export interface CatalogEntry {
    tagName: string;
    pathID: string;
    id?: string;
    startTag?: string;
    text?: string;
    textLinkable?: boolean;
    boxID?: string;
    headingIndex?: string;
    checkpoint?: number;
}
export type Catalog = Record<string, CatalogEntry>;
export interface Interaction {
    modality: 'efficient';
}
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
    structure?: StructureDiff;
}
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
    checkpoint?: number | null;
    scope?: TestScope;
    [key: string]: unknown;
}
export type TestScope = 'page' | 'changed';
export interface ScopeData {
    requested: TestScope;
    applied: boolean;
    reason: string;
    roots: string[];
    pathIDs: string[];
    commonRoot?: string;
    localRules?: string[];
    pageRules?: string[];
}
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
export interface StructureDiff {
    added: string[];
    removed: string[];
    changed: string[];
    textChanged: string[];
    roots: string[];
    counts: Record<'before' | 'after' | 'added' | 'removed' | 'changed' | 'textChanged' | 'roots', number>;
}
export interface AriaDiff {
    addedLineCount: number;
    removedLineCount: number;
    truncated: boolean;
    changes: {
        type: 'added' | 'removed';
        line: number;
        text: string;
    }[];
}
export interface FlowDelta {
    from: number;
    to: number;
    tools: ToolID[];
    notObserved: ToolID[];
    added: FlowIssue[];
    persisted: FlowIssue[];
    removed: FlowIssue[];
    notRetested: FlowIssue[];
    structure: StructureDiff;
    aria: AriaDiff;
}
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
export interface Report {
    id: string;
    what?: string;
    strict?: boolean;
    standard?: 'also' | 'only' | 'no';
    observe?: boolean;
    browserID?: BrowserID;
    device?: {
        id: string;
        windowOptions?: Record<string, unknown>;
    };
    target?: {
        what?: string;
        url: string;
    };
    sources?: Record<string, unknown>;
    creationTimeStamp?: string;
    executionTimeStamp?: string;
    timeLimit?: number;
    acts: Act[];
    imageColor?: number;
    imageScale?: number;
    stealth?: boolean;
    browserChannel?: 'bundled' | 'chrome' | 'msedge';
    scannerId?: string;
    scroll?: boolean;
    navigation?: {
        waitUntil?: 'networkidle' | 'load' | 'domcontentloaded';
        timeout?: number;
        failFast4xx?: boolean;
    };
    images?: string[];
    catalog?: Catalog;
    checkpoints?: Checkpoint[];
    pathIDs?: Record<string, Record<string, string>>;
    catalogNextIndex?: number;
    activeCheckpoint?: number | null;
    scope?: {
        roots: string[];
        commonRoot?: string;
    } | null;
    ruleScopeRoots?: string[] | null;
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
export type BadWhat = null | undefined | false | '' | string | {
    description: string;
    data?: unknown;
};
export type GetBadWhat = (element: Element) => BadWhat | Promise<BadWhat>;
declare global {
    interface Window {
        getXPath: (element: Element) => string | null | undefined;
        getAccessibleName: (element: Element) => string;
        computeAccessibleName: (element: Element) => string;
        getProtoInstance: (element: Element) => unknown;
        HTMLCS_WCAG?: unknown;
        HTMLCS_RUNNER?: {
            run: (standard: string) => string[];
        };
        HTMLCS_WCAG2AAA?: {
            sniffs?: unknown;
        };
        define?: unknown;
        exports?: unknown;
        module?: unknown;
    }
}
