import type { Page } from 'playwright';
import type { Report, StandardInstance } from '../types';
export declare const reporter: (page: Page, report: Report, _: unknown, withItems: boolean) => Promise<{
    data: {
        total: number;
        items?: {
            tagName: string;
            id: string;
            duplicatedAttribute: string;
        }[];
        prevented?: boolean;
        error?: string;
    };
    totals: number[];
    standardInstances: StandardInstance[];
}>;
