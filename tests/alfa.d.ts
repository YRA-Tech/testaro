import type { Page } from 'playwright';
import type { Report, StandardResult } from '../types';
interface StyleLoss {
    sheet: string;
    reason: 'unloaded' | 'unreadable' | 'unserialized';
    ruleCount: number | null;
}
interface SheetCopy {
    index: number;
    kind: 'dom' | 'adopted';
    copyOf: string;
    rules: number;
    omitted: string[];
    failedImports: string[];
}
interface AlfaEvalItem {
    diagnostic?: {
        errors?: {
            element?: unknown;
            positionedDescendants?: unknown;
        }[];
    };
    expectations?: {
        error?: {
            message?: string;
        };
    }[][];
    outcome: string;
    rule: {
        requirements?: {
            title?: string;
        }[];
        uri: string;
    };
    target?: {
        children?: unknown;
    };
    code?: string;
    path?: string;
}
interface AlfaNativeResult {
    totals: {
        failed: number;
        cantTell: number;
    };
    items: AlfaEvalItem[];
}
export declare const reporter: (page: Page, report: Report, actIndex: number) => Promise<{
    data: {
        prevented?: boolean;
        error?: string;
        styleLosses?: StyleLoss[];
        sheetCopies?: Omit<SheetCopy, "index">[];
    };
    result: {
        nativeResult: AlfaNativeResult;
        standardResult: StandardResult;
    };
}>;
export {};
