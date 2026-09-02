import type { Report } from '../types';
export declare const getNormalizedXPath: (xPath: string | null | undefined) => string;
export declare const getAttributeXPath: (html: string | null | undefined) => string;
export declare const getXPathCatalogIndex: (report: Report, xPath: string, checkpoint?: number) => string;
