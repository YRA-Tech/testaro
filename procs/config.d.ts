import type { BrowserID, Report } from '../types';
export type WaitState = 'networkidle' | 'load' | 'domcontentloaded';
export interface Navigation {
    waitUntil: WaitState;
    timeout: number;
    failFast4xx: boolean;
    rotateBrowsers: boolean;
}
export interface ProxyLaunchOptions {
    proxy?: {
        server: string;
        username?: string;
        password?: string;
    };
    args?: string[];
    firefoxUserPrefs?: Record<string, boolean>;
}
type JobOptions = Pick<Report, 'navigation' | 'scannerId' | 'scroll'> | null | undefined;
export declare const applyMultiplier: (baseTimeout: number) => number;
export declare const envFlag: (name: string, defaultValue?: boolean) => boolean;
export declare const waitStates: WaitState[];
export declare const getNavigation: (report: JobOptions) => Navigation;
export declare const getScannerId: (report: JobOptions) => string;
export declare const getScroll: (report: JobOptions) => boolean;
export declare const ruleLaunchRetries: number;
export declare const qualWebDefaults: {
    stealth: boolean;
    adBlock: boolean;
};
export declare const getProxyLaunchOptions: (browserID: BrowserID | string) => ProxyLaunchOptions;
export {};
