import type { Page } from 'playwright';
import type { RuleID } from '../testaro/registry';
import type { Outcome, Report, StandardInstance } from '../types';
export interface RuleSpec {
    rules?: string[];
    rulesForcedOn?: string[];
    rulesForcedOff?: string[];
}
export interface RuleSelection {
    ruleIDs: RuleID[];
    error: string;
    unknownIDs: string[];
    warnings: string[];
}
export declare const selectRules: (act: RuleSpec) => RuleSelection;
export declare const reporter: (page: Page | null | undefined, report: Report, actIndex: number) => Promise<{
    data: {
        prevented: boolean;
        error: string;
        rulePreventions: Record<string, string>;
        rulesInvalid: string[];
        ruleWarnings?: string[];
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
