import type { Page } from 'playwright';
import type { NuResult } from '../procs/nu';
import type { Report, StandardResult } from '../types';
export declare const reporter: (page: Page, report: Report, actIndex: number) => Promise<{
    data: {
        prevented?: boolean;
        error?: string;
        skipped?: boolean;
        reason?: string;
    };
    result: {
        nativeResult: NuResult;
        standardResult: StandardResult;
    };
}>;
