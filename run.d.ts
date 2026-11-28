import type { DoActsOptions } from './procs/doActs';
import type { ProgressEvent, Report } from './types';
export interface DoJobOptions extends DoActsOptions {
    onProgress?: (event: ProgressEvent) => void;
}
export declare const doJob: (job: Report, opts?: DoJobOptions) => Promise<Report>;
