import type { Page } from 'playwright';
import type { Report, StandardResult } from '../types';
interface AslintResultItem {
    message?: {
        actual?: {
            description?: string;
        };
    };
    element?: {
        xpath?: string;
    };
}
interface AslintRuleData {
    issueType: string;
    status: {
        type: string;
    };
    results: AslintResultItem[];
}
interface AslintNativeResult {
    rules?: Record<string, AslintRuleData>;
}
export declare const reporter: (page: Page, report: Report, actIndex: number) => Promise<{
    data: {
        prevented?: boolean;
        error?: string;
    };
    result: {
        nativeResult: AslintNativeResult;
        standardResult: StandardResult;
    };
}>;
export {};
