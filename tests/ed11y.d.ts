import type { Page } from 'playwright';
import type { Report, StandardResult } from '../types';
interface Ed11yNativeInstance {
    test: string;
    content: string;
    dismissalKey: string;
    html: string;
    xPath: string | null | undefined;
}
interface Ed11yNativeResult {
    resultCount?: number;
    errorCount?: number;
    warningCount?: number;
    results?: Ed11yNativeInstance[];
    prevented?: boolean;
    error?: string;
}
export declare const reporter: (page: Page, report: Report, actIndex: number) => Promise<{
    data: {};
    result: {
        nativeResult: Ed11yNativeResult;
        standardResult: StandardResult;
    };
}>;
export {};
