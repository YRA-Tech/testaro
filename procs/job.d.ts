import type { IsolationLevel, TestScope, ToolID } from '../types';
export type ToolInput = 'page' | 'html' | 'url';
export type { IsolationLevel };
export interface JobValidity {
    isValid: boolean;
    error?: string;
}
export declare const tools: Record<ToolID, string>;
export declare const toolInputs: Record<ToolID, ToolInput>;
export declare const testScopes: TestScope[];
export declare const toolScopes: Partial<Record<ToolID, boolean>>;
export declare const isolationLevels: IsolationLevel[];
export declare const getIsolation: (job?: {
    isolation?: unknown;
} | null) => IsolationLevel;
export declare const isBrowserID: (type: unknown) => boolean;
export declare const isDeviceID: (deviceID: unknown) => boolean;
export declare const isURL: (string: unknown) => boolean;
export declare const isValidAct: (act: Record<string, unknown>) => boolean;
export declare const isValidJob: (job: Record<string, unknown> | null | undefined) => JobValidity;
