import type { Page } from 'playwright';
export declare const reporter: (page: Page, _0: unknown, _1: unknown, _2: unknown, detailLevel: number, text?: string) => Promise<{
    data: Record<string, unknown>;
    totals: never[];
    standardInstances: never[];
}>;
