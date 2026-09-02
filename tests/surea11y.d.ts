import type { Page } from 'playwright';
import type { Report, StandardResult } from '../types';
type SureSeverity = 'minor' | 'moderate' | 'serious' | 'critical';
interface SureFinding {
    ruleID: string;
    what: string;
    wcag: string;
    severity: SureSeverity;
    uncertainty: string;
    needed: string;
    html: string;
    cssPath: string;
    xPath: string;
}
interface SureNativeResult {
    engine?: Record<string, unknown>;
    violations?: SureFinding[];
    incomplete?: SureFinding[];
    passRuleCount?: number;
    inapplicableRuleCount?: number;
    manualRuleCount?: number;
    manualOccurrenceCount?: number;
    prevented?: boolean;
    error?: string;
}
export declare const reporter: (page: Page, report: Report, actIndex: number) => Promise<{
    data: Record<string, unknown>;
    result: {
        nativeResult: SureNativeResult;
        standardResult: StandardResult;
    };
}>;
export {};
