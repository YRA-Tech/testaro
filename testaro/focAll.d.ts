import type { Page } from 'playwright';
import type { Report, StandardInstance } from '../types';
export declare const reporter: (page: Page, report: Report, _: unknown, withItems: boolean) => Promise<{
    data: {
        focusableCount: number;
        tabFocused: number;
        discrepancy: number;
        unreachedCount: number;
        unexpectedCount: number;
    };
    totals: number[];
    standardInstances: StandardInstance[];
}>;
