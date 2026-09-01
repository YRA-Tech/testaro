import type { Page } from 'playwright';
import type { Report, StandardResult } from '../types';
type PourSeverity = 'minor' | 'moderate' | 'serious' | 'critical';
interface PourFinding {
    ruleID: string;
    what: string;
    wcag: string;
    severity: PourSeverity;
    html: string;
    cssPath: string;
    xPath: string;
}
interface PourNativeResult {
    engineVersion?: string;
    violations?: PourFinding[];
    incomplete?: PourFinding[];
    passRuleCount?: number;
    passElementCount?: number;
    inapplicableRuleCount?: number;
    manualReviewCriterionCount?: number;
    prevented?: boolean;
    error?: string;
}
export declare const reporter: (page: Page, report: Report, actIndex: number) => Promise<{
    data: Record<string, unknown>;
    result: {
        nativeResult: PourNativeResult;
        standardResult: StandardResult;
    };
}>;
export {};
