import type { Outcome, StandardInstance, StandardResult, UncertaintyCode } from '../types';
export interface InstanceSpec {
    ruleID: string;
    what: string;
    ordinalSeverity: number;
    outcome?: Outcome;
    uncertainty?: string;
    needed?: string;
    count?: number;
    catalogIndex?: string | number;
    pathID?: string;
}
export declare const OUTCOMES: Outcome[];
export declare const UNCERTAINTY_CODES: UncertaintyCode[];
export declare const getStandardResult: () => StandardResult;
export declare const getInstance: (spec: InstanceSpec) => StandardInstance;
export declare const pushInstance: (standardResult: StandardResult, spec: InstanceSpec) => StandardInstance;
export declare const addInstance: (standardResult: StandardResult, spec: InstanceSpec) => StandardInstance;
