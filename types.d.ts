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
interface Commented {
    what?: string;
}
interface MoveTarget {
    selector?: string;
    which?: string;
    index?: number;
}
export interface ButtonAct extends MoveTarget, Commented {
    type: 'button';
}
export interface CheckpointAct extends Commented {
    type: 'checkpoint';
    which: string;
}
export interface CheckboxAct extends MoveTarget, Commented {
    type: 'checkbox';
}
export interface FocusAct {
    type: 'focus';
    what: string;
    index?: number;
    which?: string;
}
export interface LaunchAct extends Commented {
    type: 'launch';
    target?: {
        what?: string;
        url?: string;
    };
    browserID?: BrowserID;
    shoot?: {
        exclusionSelector?: string;
        colorType?: number;
        action?: string;
    };
}
export interface LinkAct extends MoveTarget, Commented {
    type: 'link';
}
export interface NextAct extends Commented {
    type: 'next';
    if: (string | number)[];
    jump?: number;
    next?: string;
}
export interface PageAct extends Commented {
    type: 'page';
}
export interface PressAct extends Commented {
    type: 'press';
    which: string;
    again?: number;
}
export interface PressesAct {
    type: 'presses';
    navKey: string;
    what?: string;
    which?: string[];
    text?: string;
    action?: string;
    withItems: boolean;
}
export interface RadioAct extends MoveTarget, Commented {
    type: 'radio';
}
export interface RevealAct extends Commented {
    type: 'reveal';
}
export interface SearchAct extends MoveTarget {
    type: 'search';
    what: string;
}
export interface SelectAct extends MoveTarget {
    type: 'select';
    what: string;
}
export interface ShootAct extends Commented {
    type: 'shoot';
    exclusionSelector?: string;
    colorType?: number;
    action: string;
}
export interface StateAct extends Commented {
    type: 'state';
    which: 'loaded' | 'idle';
}
export interface TextAct extends MoveTarget {
    type: 'text';
    what: string;
    clear?: boolean;
}
export interface URLAct extends Commented {
    type: 'url';
    which: string;
    id?: string;
}
export interface WaitAct {
    type: 'wait';
    what: 'url' | 'title' | 'body';
    which: string;
}
export interface TestActBase {
    type: 'test';
    which: ToolID;
    launch?: {
        target?: {
            what?: string;
            url?: string;
        };
        browserID?: BrowserID;
        what?: string;
    };
    rules?: string[];
    scope?: TestScope;
}
export interface ToolActProperties {
    axe: {
        detailLevel: number;
    };
    ibm: {
        withItems: boolean;
    };
    nuVal: {
        withSource?: boolean;
    };
    nuVnu: {
        withSource?: boolean;
    };
    qualWeb: {
        stealth?: boolean;
        adBlock?: boolean;
    };
    testaro: {
        withItems: boolean;
        stopOnFail: boolean;
        args?: Record<string, unknown[]>;
        rulesForcedOn?: string[];
        rulesForcedOff?: string[];
        retries?: number;
    };
    wave: {
        reportType: number;
        url?: string;
        prescript?: string;
        postscript?: string;
    };
}
export type TestAct = {
    [T in ToolID]: TestActBase & {
        which: T;
    } & (T extends keyof ToolActProperties ? ToolActProperties[T] : {});
}[ToolID];
export type JobAct = ButtonAct | CheckpointAct | CheckboxAct | FocusAct | LaunchAct | LinkAct | NextAct | PageAct | PressAct | PressesAct | RadioAct | RevealAct | SearchAct | SelectAct | ShootAct | StateAct | TestAct | TextAct | URLAct | WaitAct;
export type JobActType = JobAct['type'];
export type SpecType = 'string' | 'number' | 'boolean' | 'array' | 'object';
export type SpecSubtype = '' | 'hasLength' | 'isURL' | 'isBrowserID' | 'isFocusable' | 'isTest' | 'isWaitable' | 'areNumbers' | 'areStrings' | 'areArrays' | 'isState' | 'isScope';
type SpecTypeOf<V> = V extends string ? 'string' : V extends number ? 'number' : V extends boolean ? 'boolean' : V extends unknown[] ? 'array' : V extends object ? 'object' : never;
type PropSpecFor<A, K extends keyof A> = readonly [
    {} extends Pick<A, K> ? false : true,
    SpecTypeOf<NonNullable<A[K]>>,
    SpecSubtype,
    string
];
type SpecFor<A> = readonly [string, {
    [K in Exclude<keyof A, 'type'>]: PropSpecFor<A, K>;
}];
export interface ActSpecs {
    etc: {
        [T in Exclude<JobActType, 'test'>]: SpecFor<Extract<JobAct, {
            type: T;
        }>>;
    } & {
        test: SpecFor<TestActBase>;
    };
    tools: {
        [T in keyof ToolActProperties]: SpecFor<ToolActProperties[T]>;
    };
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
        rotateBrowsers?: boolean;
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
        abortedAct?: number | 'none';
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
        presses?: number;
        amountRead?: number;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}
export type TestActMessage = {
    status: 'ok';
} | {
    status: 'error';
    error: string;
};
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
        getProtoInstance: (element: Element | null | undefined, ruleID: string, what: string, count?: number, ordinalSeverity?: number, summaryTagName?: string, outcome?: Outcome) => {
            ruleID: string;
            what: string;
            count: number;
            ordinalSeverity: number | undefined;
            outcome: Outcome;
            pathID?: string | null | undefined;
        };
        chrome?: {
            runtime: object;
        };
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
export {};
