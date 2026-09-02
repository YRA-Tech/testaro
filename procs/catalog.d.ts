import type { Page } from 'playwright';
import type { Catalog, Report } from '../types';
export interface CatalogSnapshot {
    entries: Catalog;
    pathIDs: Record<string, string>;
    firstIndex: number;
    nextIndex: number;
    elementCount: number;
}
export declare const getAriaSnapshot: (page: Page) => Promise<string>;
export declare const catalogPage: (page: Page, report: Report, { checkpoint, restoreDetails }: {
    checkpoint: number;
    restoreDetails: boolean;
}) => Promise<CatalogSnapshot>;
export declare const getCatalog: (report: Report) => Promise<Catalog>;
export declare const pruneCheckpoint: (report: Report, checkpoint: number) => number;
export declare const pruneCatalog: (report: Report) => void;
