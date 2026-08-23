import type { Page } from 'playwright';
export declare const reporter: (page: Page) => Promise<{
    data: {
        success: boolean;
        title: string;
    };
    totals: never[];
    standardInstances: never[];
}>;
