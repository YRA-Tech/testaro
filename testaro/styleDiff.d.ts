import type { Page } from 'playwright';
import type { Report } from '../types';
interface StyleDiffTotals {
    total: number;
    subtotals?: number[];
}
export declare const reporter: (page: Page, report: Report, _: unknown, withItems: boolean) => Promise<{
    data: {
        mainStyles: string[];
        buttonStyles: string[];
        headingStyles: string[];
        listLinkStyles: string[];
        totals: Record<string, StyleDiffTotals>;
        items?: Record<string, Record<string, Record<string, string[]>>>;
    };
    totals: number[];
    standardInstances: {
        ruleID: string;
        what: string;
        ordinalSeverity: number;
        count: number;
        catalogIndex: string;
    }[];
}>;
export {};
