import type { Report, ScopeData, StructureDiff } from '../types';
export type ChangedRoots = Omit<ScopeData, 'requested' | 'localRules' | 'pageRules'>;
export declare const maxRoots = 50;
export declare const xPathToSelector: (pathID: string) => string;
export declare const getStructureDiff: (report: Report, fromIndex: number, toIndex: number) => StructureDiff;
export declare const getCommonAncestor: (pathIDs: string[]) => string;
export declare const getChangedRoots: (report: Report, checkpointIndex: number | null | undefined) => ChangedRoots;
