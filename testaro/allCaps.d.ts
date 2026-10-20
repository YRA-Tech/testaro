import type { Page } from 'playwright';
import type { Report, StandardInstance } from '../types';
export declare const reporter: (page: Page, report: Report, _: unknown, withItems: boolean) => Promise<{
    data: {
        candidateCount?: number;
        distinctCandidateCount?: number;
        aiModelUsage?: {
            inputTokens: number;
            outputTokens: number;
        };
        leftOut?: {
            count: number;
            estimatedViolations: number;
        };
        aiError?: string;
    };
    totals: number[];
    standardInstances: StandardInstance[];
}>;
