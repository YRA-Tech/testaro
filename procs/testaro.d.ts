import type { Locator, Page } from 'playwright';
import type { Outcome, Report, SeverityTotals, StandardInstance, UncertaintyCode } from '../types';
export interface RuleResult {
    data: Record<string, unknown>;
    totals: SeverityTotals;
    standardInstances: StandardInstance[];
}
interface BasicViolation {
    loc: Locator;
    what: string;
    outcome?: Outcome;
    uncertainty?: UncertaintyCode;
    needed?: string;
}
export declare const doTest: (page: Page, report: Report, withItems: boolean, ruleID: string, candidateSelector: string, whats: string, severity: number, getBadWhatString: string) => Promise<RuleResult>;
export declare const getBasicResult: (report: Report, withItems: boolean, ruleID: string, ordinalSeverity: StandardInstance["ordinalSeverity"], whats: string, data: {
    prevented?: boolean;
    [key: string]: unknown;
}, violations: BasicViolation[]) => Promise<RuleResult>;
export {};
