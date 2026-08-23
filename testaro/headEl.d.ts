import type { Page } from 'playwright';
import type { Report, StandardInstance } from '../types';
export declare const reporter: (page: Page, report: Report) => Promise<{
    data: {
        total: number;
        badTagNames: string[];
    };
    totals: number[];
    standardInstances: StandardInstance[];
}>;
