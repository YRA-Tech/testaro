import type { Page } from 'playwright';
import type { Report, ToolID } from '../types';
export type XPathNeed = 'none' | 'own' | 'script' | 'attribute';
export interface TestActOptions {
    report: Report;
    actIndex: number;
    livePage?: Page | null;
}
export declare const xPathNeeds: Partial<Record<ToolID, XPathNeed>>;
export declare const performTestAct: ({ report, actIndex, livePage }: TestActOptions) => Promise<{
    noPage: boolean;
}>;
