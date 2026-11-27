import type { Page } from 'playwright';
export interface NuContent {
    withSource: boolean | undefined;
    testTarget: string | null;
    prevented?: boolean;
    error?: string;
}
export interface NuMessage {
    type: string;
    subType?: string;
    message: string;
    extract?: string;
    [key: string]: unknown;
}
export interface NuResult {
    messages: NuMessage[];
    [key: string]: unknown;
}
export declare const getContent: (page: Page, withSource: boolean | undefined) => Promise<NuContent>;
export declare const curate: (data: {
    prevented?: boolean;
    error?: string;
}, nuData: unknown, rules: string[] | undefined) => Promise<NuResult | undefined>;
export declare const getExtractExcerpt: (extract: string | null | undefined) => string | null;
