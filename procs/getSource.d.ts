import type { Page } from 'playwright';
export interface SourceData {
    prevented: boolean;
    source: string;
    error?: string;
}
export declare const getSource: (page: Page) => Promise<SourceData>;
