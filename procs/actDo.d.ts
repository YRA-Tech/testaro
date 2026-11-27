import type { Page } from 'playwright';
import type { Act, Checkpoint, Interaction, Report } from '../types';
export interface InteractionActOptions {
    page: Page;
    report: Report;
    act: Act;
    actIndex: number;
    actCount?: number;
    interaction?: Interaction;
}
export declare const moves: Record<string, string | true>;
export declare const interactionTypes: string[];
export declare const defaultInteraction: Interaction;
export declare const debloat: (string: string) => string;
export declare const doInteractionAct: ({ page, report, act, actIndex, actCount, interaction }: InteractionActOptions) => Promise<Page>;
export declare const replayActs: (page: Page, report: Report, checkpoint: Checkpoint) => Promise<{
    page: Page;
    elapsedMs: number;
    actCount: number;
}>;
