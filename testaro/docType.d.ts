import type { Page } from 'playwright';
import type { Report } from '../types';
export declare const reporter: (page: Page, report: Report) => Promise<{
    data: {
        docHasType: boolean | "";
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
