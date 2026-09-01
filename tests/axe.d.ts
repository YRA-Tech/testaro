import type { Page } from 'playwright';
import type { AxeResults } from 'axe-core';
import type { Report, StandardResult } from '../types';
type AxeImpact = 'minor' | 'moderate' | 'serious' | 'critical';
interface AxeNativeResult {
    totals?: {
        rulesNA: number;
        rulesPassed: number;
        rulesWarned: number;
        rulesViolated: number;
        warnings: Record<AxeImpact, number>;
        violations: Record<AxeImpact, number>;
    };
    details?: AxeResults;
}
interface AxeData {
    prevented?: boolean;
    error?: string;
}
export declare const reporter: (page: Page, report: Report, actIndex: number) => Promise<{
    data: AxeData;
    result: {
        nativeResult: AxeNativeResult;
        standardResult: StandardResult;
    };
}>;
export {};
