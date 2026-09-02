import type { Page } from 'playwright';
import type { Outcome, Report, StandardInstance } from '../types';
export declare const reporter: (page: Page | undefined, report: Report, actIndex: number) => Promise<{
    data: {
        prevented: boolean;
        error: string;
        rulePreventions: Record<string, string>;
        rulesInvalid: string[];
        ruleTestTimes: [string, number][];
        ruleData: Record<string, unknown>;
        scope?: {
            localRules: string[];
            pageRules: string[];
        };
    };
    result: {
        nativeResult: Record<string, unknown>;
        standardResult: {
            prevented: boolean;
            totals: number[];
            outcomeTotals: Record<Outcome, number>;
            instances: StandardInstance[];
        };
    };
}>;
