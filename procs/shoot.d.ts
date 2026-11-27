import type { Page } from 'playwright';
import type { Report } from '../types';
export interface ShootOptions {
    exclusionSelector?: string | null;
    colorType?: number;
    action?: 'return' | 'report' | 'file';
    scale?: 'css' | 'device';
}
interface Shoot {
    (page: Page, report: Report, options: ShootOptions & {
        action: 'report';
    }): Promise<number | ''>;
    (page: Page, report: Report, options?: ShootOptions): Promise<string>;
}
export declare const shoot: Shoot;
export {};
