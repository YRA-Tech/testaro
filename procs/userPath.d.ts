import type { Act } from '../types';
export type UserPathActionType = 'click' | 'fill' | 'select' | 'navigate' | 'wait' | 'checkpoint';
export interface UserPathAction {
    type?: UserPathActionType;
    selector?: string;
    value?: string;
    url?: string;
    timeout?: number;
    label?: string;
}
export interface UserPathOptions {
    startUrl: string;
    actions: UserPathAction[];
    testActs?: Act[];
    scanAtCheckpoints?: boolean;
    what?: string;
}
export declare const actionActTypes: Record<UserPathActionType, string>;
export declare const getUserPathActs: ({ startUrl, actions, testActs, scanAtCheckpoints, what }: UserPathOptions) => Act[];
