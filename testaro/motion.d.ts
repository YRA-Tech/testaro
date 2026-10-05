import type { Report, StandardInstance } from '../types';
export declare const reporter: (_page: undefined, report: Report, actIndex: number, _withItems: boolean, signal?: AbortSignal, graceMs?: number, intervalMs?: number) => Promise<{
    data: Record<string, unknown>;
    totals: number[];
    standardInstances: StandardInstance[];
}>;
