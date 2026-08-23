import type { Page } from 'playwright';
import type { Report, StandardResult } from '../types';
interface IbmItem {
    ruleId: string;
    level: string;
    message: string;
    snippet: string;
    apiArgs?: unknown;
    category?: unknown;
    ignored?: unknown;
    messageArgs?: unknown;
    reasonId?: unknown;
    ruleTime?: unknown;
    value?: unknown;
}
interface IbmCounts {
    violation: number;
    recommendation: number;
    [key: string]: number;
}
interface IbmActReport {
    summary?: {
        counts?: IbmCounts;
    };
    results: IbmItem[];
    items?: IbmItem[];
}
type IbmTrimmedReport = {
    totals: IbmCounts;
    items: IbmItem[] | undefined;
    error?: undefined;
} | {
    totals: null;
    items: IbmItem[];
    error: string;
};
export declare const reporter: (page: Page, report: Report, actIndex: number) => Promise<{
    data: {};
    result: {
        nativeResult: IbmTrimmedReport | Record<string, never>;
        standardResult: StandardResult;
    };
} | {
    data: {
        report: IbmActReport;
    } | {
        prevented: boolean;
        error: string;
    };
    result: {};
}>;
export {};
