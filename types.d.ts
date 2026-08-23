export type ToolID = 'alfa' | 'aslint' | 'axe' | 'ed11y' | 'htmlcs' | 'ibm' | 'nuVal' | 'nuVnu' | 'qualWeb' | 'testaro' | 'wave';
export type BrowserID = 'chromium' | 'firefox' | 'webkit';
export type SeverityTotals = [number, number, number, number];
export interface StandardInstance {
    ruleID: string;
    what: string;
    ordinalSeverity: 0 | 1 | 2 | 3;
    count?: number;
    catalogIndex?: string | number;
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
}
export type Catalog = Record<string, CatalogEntry>;
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
    images?: string[];
    catalog?: Catalog;
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
