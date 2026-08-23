import type { Page } from 'playwright';
import type { Report, StandardInstance } from '../types';
export declare const reporter: (page: Page, report: Report, _0: unknown, withItems: boolean, trialKeySpecs?: string[]) => Promise<{
    data: {
        trialKeys?: string[];
    };
    totals: number[];
    standardInstances: StandardInstance[];
}>;
