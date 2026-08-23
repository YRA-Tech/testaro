import type { Page } from 'playwright';
import type { Report } from '../types';
export declare const reporter: (page: Page, report: Report, _: unknown, withItems: boolean) => Promise<import("../procs/testaro").RuleResult>;
