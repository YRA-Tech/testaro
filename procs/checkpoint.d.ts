import type { Page } from 'playwright';
import type { Catalog, Checkpoint, Interaction, Report } from '../types';
export type CatalogedReport = Report & {
    catalog: Catalog;
    checkpoints: Checkpoint[];
};
export interface CheckpointOptions {
    page: Page;
    report: CatalogedReport;
    name: string;
    actIndex: number | null;
    implicit: boolean;
    launchActIndex: number | null;
    launchURL: string;
    replay: number[];
    interaction: Interaction;
}
export declare const getDomDigest: (page: Page) => Promise<string>;
export declare const makeCheckpoint: ({ page, report, name, actIndex, implicit, launchActIndex, launchURL, replay, interaction }: CheckpointOptions) => Promise<Checkpoint>;
