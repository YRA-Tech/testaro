import type { ActsProgressEvent, Catalog, Expectation, Report } from '../types';
export interface DoActsOptions {
    onProgress?: (event: ActsProgressEvent) => void;
}
export declare const isTrue: (object: Record<string, unknown> | undefined, specs: Expectation, catalog?: Catalog) => [unknown, boolean | undefined];
export declare const doActs: (report: Report, opts?: DoActsOptions) => Promise<Report>;
