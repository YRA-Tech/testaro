import type { Page } from 'playwright';
import type { Report } from '../types';
export declare const reporter: (page: Page, report: Report, _0: unknown, withItems: boolean, attributeName: string, areLicit: boolean, values: string[]) => Promise<import("../procs/testaro").RuleResult>;
