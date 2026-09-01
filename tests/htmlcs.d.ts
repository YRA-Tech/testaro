import type { Page } from 'playwright';
import type { Report, StandardResult } from '../types';
interface HtmlcsNativeResult {
    totals: {
        failed: number;
        cantTell: number;
    };
    error: string[][];
    warning: string[][];
}
export declare const reporter: (page: Page, report: Report, actIndex: number) => Promise<{
    data: {
        prevented?: boolean;
        error?: string;
    };
    result: {
        nativeResult: HtmlcsNativeResult;
        standardResult: StandardResult;
    };
}>;
export {};
