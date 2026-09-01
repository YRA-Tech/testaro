import type { Report, StandardInstance } from '../types';
export declare const reporter: (_0: unknown, report: Report, _1: unknown, withItems: boolean) => Promise<{
    data: {
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
