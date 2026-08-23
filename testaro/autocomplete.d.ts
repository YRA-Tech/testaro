import type { Page } from 'playwright';
import type { Report } from '../types';
export declare const reporter: (page: Page, report: Report, _0: unknown, withItems: boolean, labels?: Record<"name" | "email" | "given" | "family", string[]>) => Promise<import("../procs/testaro").RuleResult>;
