import type { Page } from 'playwright';
import type { Report, StandardInstance } from '../types';
export declare const reporter: (page: Page, report: Report) => Promise<{
    data: {
        prevented?: boolean;
        error?: string;
    };
    totals: number[];
    standardInstances: StandardInstance[];
}>;
