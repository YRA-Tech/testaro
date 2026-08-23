import type { Page } from 'playwright';
import type { Report, StandardInstance } from '../types';
interface NavTally {
    total: number;
    correct: number;
    incorrect: number;
}
interface TabItemData {
    xPath?: string | null;
    navigationErrors?: string[];
    text?: string;
}
interface TabNavData {
    totals: {
        navigations: {
            all: NavTally;
            specific: Record<string, NavTally>;
        };
        tabElements: NavTally;
        tabLists: NavTally;
    };
    tabElements?: {
        incorrect: TabItemData[];
        correct: TabItemData[];
    };
    prevented?: boolean;
}
export declare const reporter: (page: Page, report: Report, _: unknown, withItems: boolean) => Promise<{
    data: TabNavData;
    totals: number[];
    standardInstances: StandardInstance[];
}>;
export {};
