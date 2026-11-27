/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Act} from '../types';

/*
  userPath
  Converts a recorded user path (a start URL and a sequence of actions of the kinds a
  Playwright codegen recording yields: click, fill, select, navigate, wait, checkpoint) into
  the acts of a Testaro job, so that a job tests the page states the path reaches. Each
  action becomes one act; each checkpoint action becomes a checkpoint act followed by the
  test acts requested. See docs/checkpoint-scanning.md (Phase 4). Compiled to userPath.js by
  tsc (issue #73); edit this file, not the emitted one.

  An action is {type, selector?, value?, url?, timeout?, label?}. Selectors are Playwright
  selectors (CSS, or text=, role=, label= forms), used as the selector property of the act.

  yra-web-scan-worker imports this file as testaro/procs/userPath; keep its path and exports.
*/

// TYPES

// The kinds of recorded action.
export type UserPathActionType = 'click' | 'fill' | 'select' | 'navigate' | 'wait' | 'checkpoint';
/*
  A recorded action. Recordings come from outside, so getUserPathActs checks each action at
  run time and throws on an unknown type or a missing property.
*/
export interface UserPathAction {
  type?: UserPathActionType;
  selector?: string;
  value?: string;
  url?: string;
  timeout?: number;
  label?: string;
}
// The arguments of getUserPathActs.
export interface UserPathOptions {
  startUrl: string;
  actions: UserPathAction[];
  testActs?: Act[];
  scanAtCheckpoints?: boolean;
  what?: string;
}

// CONSTANTS

// The action types and the act types they become.
export const actionActTypes: Record<UserPathActionType, string> = {
  click: 'button',
  fill: 'text',
  select: 'select',
  navigate: 'url',
  wait: 'state',
  checkpoint: 'checkpoint'
};

// FUNCTIONS

// Returns a checkpoint name unique among those used, from a label or an ordinal.
const getCheckpointName = (label: string | undefined, ordinal: number, used: Set<string>): string => {
  const base = (label || '').trim().replace(/\s+/g, ' ') || `checkpoint${ordinal}`;
  let name = base === 'start' ? `${base}-${ordinal}` : base;
  let suffix = 1;
  while (used.has(name)) {
    name = `${base}-${++suffix}`;
  }
  used.add(name);
  return name;
};
/*
  Returns the acts of a job for a user path, or throws if an action is invalid.
    startUrl: the URL the path starts at (the launch act's target).
    actions: the recorded actions.
    testActs: the test acts (without checkpoint-dependent properties) to run at each
      checkpoint, e.g. [{type: 'test', which: 'axe', detailLevel: 0}]; each is copied per
      checkpoint. With scope 'changed', the first checkpoint's copies are given scope 'page',
      since there is no earlier checkpoint to compare.
    scanAtCheckpoints: whether checkpoints get the test acts (default true).
    what: a description of the launch target.
*/
export const getUserPathActs = ({startUrl, actions, testActs = [], scanAtCheckpoints = true, what}: UserPathOptions): Act[] => {
  if (! startUrl || typeof startUrl !== 'string') {
    throw new Error('User path has no start URL');
  }
  if (! Array.isArray(actions)) {
    throw new Error('User path actions are not an array');
  }
  const acts: Act[] = [{
    type: 'launch',
    target: {url: startUrl, what: what || 'start of the user path'}
  }];
  const usedNames = new Set<string>();
  let checkpointCount = 0;
  actions.forEach((action, index) => {
    const {type, selector, value, url, timeout, label}: UserPathAction = action || {};
    const comment = label || undefined;
    const need = (condition: unknown, message: string): void => {
      if (! condition) {
        throw new Error(`Action ${index} (${type}): ${message}`);
      }
    };
    if (type === 'click') {
      need(selector, 'requires a selector');
      acts.push({type: 'button', selector, what: comment});
    }
    else if (type === 'fill') {
      need(selector, 'requires a selector');
      need(typeof value === 'string' && value.length, 'requires a value');
      acts.push({type: 'text', selector, what: value, clear: true});
    }
    else if (type === 'select') {
      need(selector, 'requires a selector');
      need(typeof value === 'string' && value.length, 'requires a value');
      acts.push({type: 'select', selector, what: value});
    }
    else if (type === 'navigate') {
      need(url, 'requires a url');
      acts.push({type: 'url', which: url, what: comment});
    }
    else if (type === 'wait') {
      // A recorded pause becomes a wait for the page to be idle; the pause length is kept
      // as a comment.
      acts.push({type: 'state', which: 'idle', what: `pause ${timeout ?? 1000} ms`});
    }
    else if (type === 'checkpoint') {
      const name = getCheckpointName(label, ++checkpointCount, usedNames);
      acts.push({type: 'checkpoint', which: name, what: comment});
      if (scanAtCheckpoints) {
        testActs.forEach(testAct => {
          const act = {... testAct};
          if (act.scope === 'changed' && checkpointCount === 1) {
            act.scope = 'page';
          }
          acts.push(act);
        });
      }
    }
    else {
      throw new Error(`Action ${index}: unknown type ${type}`);
    }
  });
  // Remove undefined comments, so the acts serialize cleanly.
  acts.forEach(act => {
    if (act.what === undefined) {
      delete act.what;
    }
  });
  return acts;
};
