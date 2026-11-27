import type { Page } from 'playwright';
import type { Report } from '../types';
export interface ToolReport {
    data?: object;
    result?: object;
}
export interface ToolModule {
    reporter(page: Page, report: Report, actIndex: number, timeLimit: number): Promise<ToolReport>;
}
export declare const toolLoaders: {
    alfa: () => typeof import('./alfa');
    aslint: () => typeof import('./aslint');
    axe: () => typeof import('./axe');
    ed11y: () => typeof import('./ed11y');
    htmlcs: () => typeof import('./htmlcs');
    ibm: () => typeof import('./ibm');
    nuVal: () => typeof import('./nuVal');
    nuVnu: () => typeof import('./nuVnu');
    pour: () => typeof import('./pour');
    qualWeb: () => typeof import('./qualWeb');
    surea11y: () => typeof import('./surea11y');
    testaro: () => typeof import('./testaro');
    wave: () => typeof import('./wave');
};
