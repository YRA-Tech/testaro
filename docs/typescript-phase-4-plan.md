# TypeScript Phase 4: the engine

**Status:** Active · **Owner:** Jeff Witt · **Written:** 2026-11-27 · **Updated:** 2026-11-27

Phases 0–3 of the migration in issue #73 merged on 22–23 August 2026. This plan covers Phase 4, the engine. Its decisions were confirmed on 27 November 2026. Batches 4.1–4.5 merged on 27 November 2026 (#213, #214, #216, #218, #225), 4.1–4.4 released in 78.9.0, and 4.6 is #227. #160 merged and #170 closed, so nothing holds the remaining batches (decision 3).

## Where things stand

Phases 0–3 converted the shared types (`types.ts`), four core procs (`testaro`, `xPath`, `catalog`, `standard`), all 52 rule modules with their generated registry, and all 11 tool adapters. Of testaro's 111 first-party JavaScript files (vendored bundles and test fixtures excluded), 71 are now emitted from TypeScript, and 6 uses of `any` remain.

What is left is the engine: the code that validates a job, launches browsers, performs acts, forks a process per test act, records checkpoints and flow, and polls for jobs. It is about 5,500 lines in 24 files, and it has grown since the RFC, because the checkpoint work of September (`actDo`, `checkpoint`, `flow`, `scope`, `userPath`, `testAct`) was written in JavaScript.

Converted TypeScript reaches into the engine through six hand-written declaration files (`procs/config.d.ts`, `getSource.d.ts`, `launch.d.ts`, `nu.d.ts`, `shoot.d.ts`, `xPathScript.d.ts`). Nothing checks them against the JavaScript they describe, so they can drift without any error.

## What Phase 4 does and does not do

It converts each engine file to strict TypeScript, under the rules the earlier phases followed:

- **No behavior change.** A bug that typing reveals is kept as it is, with a comment in the code, and filed as an issue to fix in a separate PR, as Phase 1 did for the string `ordinalSeverity`.
- **Same layout.** `foo.ts` sits beside its emitted `foo.js` at the same path, the emitted files are committed, and CI fails if they drift. Every `require` path stays valid, which matters to consumers that import engine files directly (below).
- **CommonJS stays.** The August reassessment in #73 found no reason to move to ESM.
- **Strict from the first PR.** `strict: true` applies to each file as it converts.

It does not convert the validation harness (`validation/`), the ACT harness (`validation/act/`), or the build inputs (`procs/generateRuleRegistry.js`, `src/nameComputation.js`, `aceconfig.js`). They are tooling, not the engine, and Phase 5 can decide whether they convert.

It also does not convert `procs/aslint.js`, which this plan first listed in 4.1. It is not a module: `tests/aslint` reads its text and evaluates it in the page, after the ASLint bundle. tsc's emit begins every file with `"use strict"`, so converting it would run it in strict mode in the page, which would change its behavior. It stays JavaScript, like the vendored bundles.

## Who depends on these files

YRA's scan worker imports four engine files directly, each with an untyped `require` and a cast of its own: `testaro/run` (`doJob`), `testaro/actSpecs`, `testaro/procs/userPath`, and `testaro/procs/config` (`getProxyLaunchOptions`). Their paths and export shapes must not change. Once they convert, the worker can drop its casts and use testaro's declarations instead; that is a follow-up in the worker, not part of this plan.

The worker no longer patches testaro, so the change in the emitted JavaScript's text does not break any patch.

## Hazards

These are specific to the engine, and each PR that touches one must check it.

1. **Code that runs in the page.** `launch.js` has 12 `page.evaluate`/`addInitScript` callbacks and defines 4 `window` globals, `actDo.js` has 6, and `xPathScript.js` is a function that is added to every page as an init script. Such a function is serialized, so it must not refer to anything outside itself. TypeScript's CommonJS emit rewrites calls of imported functions as `(0, module_1.fn)(…)`; inside a serialized callback that would throw in the page. Each callback's text must be compared before and after (see Verification). Running a `.ts` file directly with `tsx` is a separate trap: esbuild inserts a `__name` helper into named inner functions, which is undefined in the page. Use the emitted `.js`.
2. **The `launch`/`actDo` cycle.** `launch.js` and `actDo.js` require each other, and both break the cycle by requiring lazily, inside a function (`require('./actDo')` at the point of use; `getLaunch = () => require('./launch')`). A top-level `import` would change load order. Keep the lazy `require`, typed as `require('./actDo') as typeof import('./actDo')`.
3. **Module-level state.** `launch.js` keeps the browser shared by a job (`sharedBrowser`, `sharedBrowserID`) in module-level variables. They must stay module-level, with the same lifetime.
4. **Calls through `exports`.** `actDo.js` calls its own `exports.doInteractionAct` and reads `exports.defaultInteraction`. Nothing replaces them today, so calling the functions directly is equivalent, but the token diff will show the change and the PR should say so.
5. **The child-process contract.** `doActs.js` forks `procs/doTestAct` for each test act under `process` isolation and exchanges messages with it. The message shapes exist only in the code. Phase 4 declares them in `types.ts`, so both ends are checked against one definition.
6. **Dynamic loading of tool adapters.** `testAct.js` loads an adapter with ``require(`../tests/${which}`)``. The RFC planned a registry of lazy thunks for this in Phase 3, but it was not built. It belongs with `testAct`, so that a tool ID becomes a checked union and an adapter's signature is checked.
7. **Strict mode.** tsc's emit begins every converted file with `"use strict"`, and the hand-written files are not strict. Code that relied on sloppy mode changes behavior: an assignment to a property of a primitive, or to a read-only property, is silently ignored in sloppy mode and throws in strict mode, and so does deleting a non-configurable property. Type checking does not catch these, because the values come from outside (job JSON, tool output). 4.1 found one: `curate` in `procs/nu` assigns to a property of its result, which is a string when vnu-jar reports a page without messages, so the act failed with a different error. Each batch looks for such assignments and deletions on values that may be primitives, keeps the sloppy behavior with an explicit test and a comment, and feeds primitive inputs to the differential test.
8. **`actSpecs.js` as a runtime type system.** It stays the runtime validator, as the RFC decided. Phase 4 adds a type for each act, and checks `actSpecs` against them with `satisfies`, so the two cannot drift apart.

## Batches

Bottom-up, so that no converted file needs a new hand-written declaration file. Each batch is one PR, reviewable alone, of at most about 700 changed lines of TypeScript (emitted files excluded). The line counts are of today's JavaScript.

| PR | Files | Lines | Depends on | Deletes | Notes |
|---|---|---|---|---|---|
| 4.1 | `config`, `dateTime`, `error`, `getSource`, `nu`, `shoot` | 499 | — | `config.d.ts`, `getSource.d.ts`, `nu.d.ts`, `shoot.d.ts` | Leaves. `config` is imported by the worker. Adds the verification tools (decision 4). |
| 4.2 | `xPathScript`, `scope`, `userPath`, `flow`, `checkpoint` | 723 | 4.1 | `xPathScript.d.ts` | `xPathScript` runs in the page (hazard 1). `userPath` is imported by the worker. |
| 4.3 | `actDo` | 802 | 4.1 | — | 6 in-page callbacks (1), the cycle with `launch` (2), calls through `exports` (4). Uses `launch.d.ts`, extended where it lacks what `actDo` calls. |
| 4.4 | `testAct`, `doTestAct`, adapter registry | 257 + registry | 4.1 | — | Builds the adapter registry (6) and declares the child's messages (5). |
| 4.5 | `job`, `actSpecs`, act types | 651 + types | 4.1 | — | Adds a type for each act and checks `actSpecs` with `satisfies` (8). `actSpecs` is imported by the worker. |
| 4.6 | `launch` | 915 | 4.2, 4.3 | `launch.d.ts` | The riskiest file: 12 in-page callbacks, 4 `window` globals, shared browser state (1–3). |
| 4.7 | `doActs` | 813 | 4.2–4.6 | — | The parent end of the child-process contract (5). |
| 4.8 | `run`, `call`, `netWatch`, `dirWatch` | 894 | 4.5, 4.7 | — | Entry points. `run` (`doJob`) is the worker's main import. `netWatch` holds the server-polling authentication. |

After 4.8 every engine file is TypeScript and all six hand-written declaration files are gone.

### Order around open PRs

Converting a file rewrites it, so any open PR that edits the same file has to be redone in TypeScript. Two open PRs edit engine files today:

- **#160** (`motion` runs concurrently): `launch.js`.
- **#170** (Alfa's lost stylesheets): `launch.js`, `doActs.js`, `actSpecs.js`.

4.1–4.4 touch neither file, so they can start now. 4.5 (`actSpecs`), 4.6 (`launch`) and 4.7 (`doActs`) wait for both PRs to merge or close, and 4.8 depends on 4.7. A new PR that edits an engine file in the meantime should land before that file's batch, or wait until after it.

## Verification

Each PR repeats the checks the earlier phases used (#98, #115, #120), plus two:

1. **Emit diff.** The emitted `.js` is compared with the original JavaScript token by token (with acorn). Allowed differences are type erasure, CommonJS plumbing (`exports.x = x`, `(0, mod.fn)(…)` outside serialized code), and parentheses from erased casts. Every other difference is listed and explained in the PR.
2. **Serialized-code check.** Every function the PR's files pass to `page.evaluate`, `page.$$eval`, `addInitScript` or `waitForFunction`, or ship as source text, is extracted from the original and the emitted file, and the two texts must be identical. This is the check that catches hazard 1.
3. **Differential test.** Each exported function that can run without a browser is run in the original and the converted version on the same inputs, and the results, the mutations of their arguments and the log output must be identical. The inputs include malformed and primitive values (strings, numbers, booleans and arrays where an object is expected), because those are where strict mode changes behavior (hazard 7). A module that reads the environment when it loads is tested in a fresh process per environment setting. As in #98, the test is per PR and is described in the PR, not committed.
4. **End-to-end, branch against `main`.** A fixed set of jobs runs on both, and their reports must be byte-identical after timestamps, timings and repository paths are normalized. The set grows with the batches:
   - every tool on a page rich in violations;
   - a job with checkpoints and a changed scope;
   - a user path;
   - each isolation level (`process`, `browser`, `page`);
   - from 4.8, a `netWatch` round trip against a local mock server, and a `dirWatch` pickup.

   CI also runs the 60 validators and the unit tests on every PR.
5. **Worker smoke test.** For PRs that change a file the worker imports (4.1, 4.2, 4.5, 4.8), the branch is packed with `npm pack`, installed in a checkout of `yra-web-scan-worker`, and the worker's tests and one local scan are run, before the PR merges.

## Decisions

All five were confirmed by Jeff Witt on 27 November 2026.

1. **Act types.** Add a discriminated union with one type per act type in 4.5, as the RFC planned, and check `actSpecs` against it with `satisfies`. The alternative is to keep today's permissive `Act` and declare local interfaces where they are needed, as `tests/testaro.ts` does for its act. *Decided: the union.* It is what lets `actDo` and `doActs` be checked against the act they handle.
2. **Out of scope.** Leave the validation harness, the ACT harness and the build inputs in JavaScript for Phase 4. *Decided.*
3. **Order around #160 and #170.** Start 4.1–4.4 now, and hold 4.5–4.8 until both PRs merge or close. If they are still open when 4.4 merges, decide then whether to wait or convert and rebase them. *Decided.*
4. **Commit the verification tools.** The emit diff and the serialized-code check were one-off scripts in the earlier phases. Phase 4 runs them in 8 PRs, so commit them under `validation/executors/` in 4.1. *Decided.*
5. **Releases.** Each batch changes no behavior, so each can ship in a patch release, but it is simpler to release when it suits other work, with the worker smoke test before any release that includes 4.1, 4.2, 4.5 or 4.8. *Decided: release with other work.*

## Effort

8 PRs, about 5,500 lines of JavaScript. Phases 2 and 3 converted about 60 smaller, uniform files in two days; the engine files are larger, stateful and individually different, so allow about a PR a day for the work, plus review. The waits for #160 and #170 are likely to set the calendar more than the work does.

## After Phase 4

Phase 5, as the RFC defines it: delete any remaining stubs, audit the remaining `any`s (target: the one documented cast at the `eval` in `procs/testaro.ts`), and decide whether the validation harness and the build inputs convert. The worker then drops its casts and imports testaro's declarations.
