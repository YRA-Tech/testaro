import type { Page } from 'playwright';
import type { Report, StandardResult } from '../types';
interface QwElement {
    htmlCode?: string;
}
interface QwRaResult {
    verdict: string;
    description?: string;
    elements?: QwElement[];
}
interface QwRuleAssertions {
    metadata?: {
        warning?: number;
        failed?: number;
    };
    results: QwRaResult[];
}
interface QwModuleReport {
    assertions?: Record<string, QwRuleAssertions>;
}
interface QwNativeResult {
    system?: {
        url?: string;
        evaluation?: string;
    };
    modules?: Record<string, QwModuleReport>;
}
export declare const reporter: (page: Page, report: Report, actIndex: number, timeLimit: number) => Promise<{
    data: {
        prevented?: boolean;
        error?: string;
        rulePreventions?: Record<string, string>;
    };
    result: {
        nativeResult: QwNativeResult;
        standardResult: StandardResult;
    };
}>;
export {};
