import type { Locator } from 'playwright';
import type { Report } from '../types';
export interface StyledElement {
    index: number;
    group: string;
    values: string[];
}
export declare const getStyleResult: (report: Report, withItems: boolean, ruleID: string, whats: string, loc: Locator, styleProps: string[], elements: StyledElement[], getNouns: (group: string) => [string, string]) => Promise<import("./testaro").RuleResult>;
