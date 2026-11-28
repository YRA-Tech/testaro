declare const basicAuthHeader: (workerID: string, workerSecret: string) => string;
export declare const netWatch: (isForever: boolean, intervalInSeconds: number, isCertTolerant?: boolean) => Promise<boolean>;
export { basicAuthHeader };
