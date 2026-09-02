import type { Page } from 'playwright';
export declare const reporter: (page: Page, _0: unknown, _1: unknown, _2: unknown, detailLevel?: number, tagName?: string | null, onlyVisible?: boolean, attribute?: string) => Promise<{
    data: Record<string, unknown>;
    totals: never[];
    standardInstances: never[];
}>;
