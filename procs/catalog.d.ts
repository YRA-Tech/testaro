import type { Catalog, Report } from '../types';
export declare const getCatalog: (report: Report) => Promise<Catalog>;
export declare const pruneCatalog: (report: Report) => void;
