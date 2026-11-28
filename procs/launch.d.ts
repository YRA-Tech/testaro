import type { Browser, BrowserContextOptions, Page } from 'playwright';
import type { WaitState } from './config';
import type { XPathNeed } from './testAct';
import type { BrowserID, Report } from '../types';
export interface NavResult {
    success: boolean;
    error?: string;
    rejectionData?: Record<string, unknown>;
}
export interface LaunchOptions {
    report?: Report;
    actIndex?: number | null;
    tempBrowserID?: BrowserID | '';
    tempURL?: string;
    headEmulation?: 'low' | 'high';
    xPathNeed?: XPathNeed;
    needsAccessibleName?: boolean;
    retries?: number;
    signal?: AbortSignal;
    contextOverrides?: BrowserContextOptions;
    replay?: boolean;
    beforeReplay?: (page: Page) => void | Promise<void>;
    reportFailure?: boolean;
    independentBrowser?: boolean;
}
export declare const wait: (ms: number, signal?: AbortSignal) => Promise<string>;
export declare const setSharedBrowser: (browser: Browser | null, browserID: BrowserID | '') => void;
export declare const getSharedBrowser: () => Browser | null;
export declare const closeSharedBrowser: () => Promise<void>;
export declare const browserClose: (page: Page | null | undefined) => Promise<void>;
export declare const goTo: (report: Report, page: Page, url: string, timeout: number, waitUntil: WaitState) => Promise<NavResult>;
export declare const preparePage: (page: Page, { xPathNeed, needsAccessibleName }?: Pick<LaunchOptions, 'xPathNeed' | 'needsAccessibleName'>) => Promise<void>;
export declare const launch: (opts?: LaunchOptions) => Promise<Page | null>;
