import type { Page } from 'playwright';
import type { Report, StandardResult } from '../types';
interface WaveItem {
    count: number;
    description: string;
    selectors: (string | [string, string])[];
}
interface WaveCategory {
    count: number;
    items?: Record<string, WaveItem>;
}
interface WaveResult {
    categories?: Record<string, WaveCategory>;
    status: {
        success: boolean;
        error?: string;
    };
    statistics?: {
        pagetitle?: string;
        pageurl?: string;
        time?: number;
        creditsremaining?: number;
        allitemcount?: number;
        totalelements?: number;
        waveurl?: string;
    };
}
interface WaveData {
    prevented?: boolean;
    error?: string;
    pageTitle?: string;
    pageURL?: string;
    elapsedSeconds?: number | null;
    creditsRemaining?: number | null;
    allItemCount?: number | null;
    totalElements?: number | null;
    waveURL?: string;
}
export declare const reporter: (page: Page, report: Report, actIndex: number) => Promise<{
    data: WaveData;
    result: {
        nativeResult: WaveResult;
        standardResult: StandardResult;
    };
}>;
export {};
