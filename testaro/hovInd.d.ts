import type { Page } from 'playwright';
import type { Report, SeverityTotals } from '../types';
export declare const reporter: (page: Page, report: Report, _: unknown, withItems: boolean) => Promise<{
    data: {
        triggerCount: number;
        inspectedCount: number;
        prevented?: boolean;
        error?: string;
    };
    totals: SeverityTotals;
    standardInstances: import("../types").StandardInstance[];
}>;
