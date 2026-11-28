# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install / update all dependencies and Playwright browsers
npm run deps

# Build the bundled accessible-name computation script
npm run build

# Lint (ESLint)
npm run lint

# Validate a single Testaro rule (replace <ruleID> with the rule name, e.g. allSlanted)
npm test <ruleID>

# Validate all Testaro rules
npm run tests

# Validate the request headers that launches add (optionally name the browser types)
npm run headers

# Run a job from JOBDIR/todo (optionally prefix-match by timestamp)
node call run [jobIDStart]

# Watch a directory for jobs
node call dirWatch <true|false> <intervalSeconds>

# Poll a network server for jobs
node call netWatch <true|false> <intervalSeconds> [<true|false>]
```

## Architecture

Testaro is an ensemble accessibility test runner. It integrates 12 external tools plus ~50 of its own rules (the "testaro" tool) and produces standardized reports from a job document.

### Job → Report lifecycle

1. A caller provides a **job** — a plain JS/JSON object with a `target` URL, `browserID`, optional `device`, and an `acts` array.
2. `run.ts` exports `doJob(job)`, which validates the job (`procs/job.ts`), builds a DOM **catalog** (`procs/catalog.ts`) as checkpoint 0, then delegates to `procs/doActs.ts`.
3. `procs/doActs.ts` iterates the acts array. For `test` acts it forks a child process running `procs/doTestAct.ts` (one per tool invocation) and enforces per-tool time limits. Non-test acts (browser interactions) execute in the parent through `procs/actDo.ts`. A `checkpoint` act snapshots the live page (`procs/checkpoint.ts`) as a page state that later test acts observe: the child's launcher replays the recorded interaction acts before the tool runs (`docs/checkpoint-scanning.md`).
4. Each tool's test module lives in `tests/<toolID>.ts` (compiled to a committed `tests/<toolID>.js`). It calls the tool's library and converts the native result to the **standard result** shape (`prevented`, `totals[4]`, `outcomeTotals`, `instances[]`) using the helpers in `procs/standard.ts`. Every instance carries an `outcome` (`failed` or `cantTell`) that is the authoritative certainty signal; `ordinalSeverity` still encodes certainty per tool until it is redefined as impact only (see `docs/standard-result-outcome.md`).
5. `doJob` returns the job object with `jobData` and `catalog` added at the top level and `result` added inside each `test` act. The job's `standard` property controls what `result` contains: `'no'` → `nativeResult` only; `'only'` → `standardResult` only; `'also'` → both.

The 20 act types are defined and documented in `actSpecs.ts` (`etc` property), and typed one by one as `JobAct` in `types.ts`, against which `actSpecs` is checked. The main interactive types are `button`, `checkbox`, `focus`, `link`, `press`, `presses`, `radio`, `reveal`, `search`, `select`, `text`, `url`, `wait`. The `test` type runs a tool. `launch`, `next`, `page`, `state` control flow. `checkpoint` snapshots a page state. A `test` act's optional `scope` (`page` or `changed`) restricts element-local rules to the subtrees changed since the previous checkpoint (`procs/scope.ts`); reports with two or more checkpoints gain `flow`, the issue deltas between checkpoints (`procs/flow.ts`). Move acts accept a Playwright `selector`; `procs/userPath.ts` converts a recorded user path (yra-monitor's action shape) into acts. See `docs/checkpoint-scanning.md`.

### Testaro rules (`testaro/` directory)

Each file exports a `reporter(page, catalog, withItems)` async function. Rules are registered in `tests/testaro.ts` in the `allRules` array, which controls default execution order, contamination flags, time limits, `defaultOn`, and an optional default `outcome`. The generated `testaro/registry.ts` maps rule IDs to modules.

The default order in `allRules` reflects a two-phase execution strategy: non-contaminating rules (`contaminates: false`) come first and all share a single page load; contaminating rules (`contaminates: true`) follow, each tested on a freshly loaded copy of the page.

A rule with `concurrent: true` (currently only `motion`) is taken out of that sequence: it starts before the serial rules, launches and closes its own page, receives no page and an `AbortSignal` that fires on timeout, and is awaited after the serial rules end. All rule results are recorded in `allRules` order. The `motion` rule uses this so that its waiting costs no act time: on a tall-viewport page it waits a grace period after loading, makes three images at intervals, and compares consecutive images.

Two implementation patterns exist:

- **`doTest`** (`procs/testaro.ts`): for rules whose verdict on each element can be computed in-browser via `page.evaluate`. The caller passes a CSS selector and a serialized `getBadWhat(element)` function string. This is the preferred pattern (~48 of ~50 rules).
- **`getBasicResult`** (`procs/testaro.ts`): for rules that need Playwright APIs or cross-element state (currently only `hover` and `role`).

### Validation

A revision of the validation architecture is currently being planned. In the meantime the next paragraph describes its current design, not guaranteed to work without error.

Validation tests live in `validation/tests/jobProperties/` (jobs with `expect` arrays) and `validation/tests/targets/` (static HTML pages served locally as test targets). Running `npm test <ruleID>` executes `validation/executors/test.js` → `validation/validateTest.js`, which runs the job and compares `result` fields against `expect` clauses.

### Tool XPath strategy

The catalog maps XPaths to element metadata. Each tool uses a different approach to report the elements it flags:

- `alfa`, `aslint`: report their own XPaths; Testaro normalizes them.
- `ed11y`, `wave`: Testaro injects `window.getXPath` and calls it per element.
- `axe`, `htmlcs`, `ibm`, `nuVal`, `nuVnu`, `qualWeb`: Testaro stamps `data-xpath` attributes on all elements before the tool runs.
- `testaro`: each rule reports XPaths directly.

### Environment (`.env`)

Key variables:

- `HEADED_BROWSER` — show browser windows during tests
- `DEBUG` — mirror browser console to terminal
- `WAITS` — ms delay inserted between Playwright operations (useful for debugging)
- `WAVE_KEY` — API key for the WAVE subscription API
- `JOBDIR` / `REPORTDIR` — root directories for job files and report output
- `NETWATCH_URL_JOB`/`NETWATCH_URL_REPORT`/`NETWATCH_AUTH_TYPE`/`NETWATCH_WORKER_ID`/`NETWATCH_WORKER_SECRET` — server polling configuration
- `TIMEOUT_MULTIPLIER` — scales all per-tool time limits (default 1)
- `NAV_WAIT_UNTIL`/`NAV_TIMEOUT`/`NAV_FAIL_FAST_4XX`/`NAV_ROTATE_BROWSERS`, `SCANNER_ID`, `PRESCAN_SCROLL`, `TESTARO_RULE_RETRIES` — deployment defaults that job properties (`navigation`, `scannerId`, `scroll`, `browserChannel`; `retries` on test acts) override (`procs/config.ts`). (`QUALWEB_STEALTH`/`QUALWEB_ADBLOCK` and a `qualWeb` act's `stealth`/`adBlock` no longer have any effect: qualWeb runs in the page under test.)

## Code style

These are TypeScript sources, and their `.js` and `.d.ts` outputs are committed (keep the list in alphabetical order, one file per line):

- the rule modules in `testaro/`
- the tool adapters in `tests/` and their registry, `tests/registry.ts`
- `actSpecs.ts`
- `call.ts`
- `dirWatch.ts`
- `netWatch.ts`
- `procs/actDo.ts`
- `procs/catalog.ts`
- `procs/checkpoint.ts`
- `procs/config.ts`
- `procs/dateTime.ts`
- `procs/doActs.ts`
- `procs/doTestAct.ts`
- `procs/error.ts`
- `procs/flow.ts`
- `procs/getSource.ts`
- `procs/job.ts`
- `procs/launch.ts`
- `procs/nu.ts`
- `procs/scope.ts`
- `procs/shoot.ts`
- `procs/standard.ts`
- `procs/styleConsistency.ts`
- `procs/testAct.ts`
- `procs/testaro.ts`
- `procs/userPath.ts`
- `procs/xPath.ts`
- `procs/xPathScript.ts`
- `run.ts`
- `types.ts`

Edit the `.ts` file, then run `npm run build:ts` (and `npm run build:registry` after adding or removing a rule module) and commit the regenerated outputs; CI fails if they drift. Files without a `.ts` counterpart are still plain JavaScript. See `CONTRIBUTING.md`.

ESLint (`eslint.config.mjs`): 2-space indent, single quotes, semicolons, Stroustrup brace style (`else`/`catch` on a new line after `}`), `no-use-before-define`. Emitted `.js` files are excluded from linting. The vendored `htmlcs/HTMLCS.js`, `ed11y`, `surea11y`, and `pour` bundles are excluded from linting; `htmlcs/HTMLCS.js` must not be reformatted.

Long comments are not broken into multiple lines per paragraph.

## Adding a new Testaro rule

1. Add an entry to `allRules` in `tests/testaro.ts`.
2. Create `testaro/<ruleID>.ts` exporting a `reporter` function using `doTest` (preferred) or `getBasicResult`, then run `npm run build:registry && npm run build:ts` and commit the regenerated registry and emitted files.
3. Write a validation job in `validation/tests/jobProperties/<ruleID>.json` with an `expect` array and corresponding HTML target(s) in `validation/tests/targets/<ruleID>/`.
4. Run `npm test <ruleID>` until validation passes.

## Key files

| File | Purpose |
| ---- | ------- |
| `actSpecs.ts` | Canonical specs for all 20 act types, checked against `JobAct` (`types.ts`) |
| `call.ts` | CLI wrapper for `run`, `dirWatch`, `netWatch` |
| `dirWatch.ts` | Watches a directory for jobs and saves their reports |
| `netWatch.ts` | Polls a server for jobs and submits their reports |
| `procs/actDo.ts` | Performs the acts that operate on a live page; replays a checkpoint's acts |
| `procs/catalog.ts` | Builds the element catalog from the DOM (checkpoint 0, and any live page for later checkpoints) |
| `procs/checkpoint.ts` | Snapshots a live page as a checkpoint |
| `procs/config.ts` | Shared configuration values |
| `procs/doActs.ts` | Iterates acts; forks child for each tool; assigns test acts to checkpoints |
| `procs/doTestAct.ts` | Child-process entry point for tool invocations |
| `procs/flow.ts` | Tracker of rule violation changes across checkpoints |
| `procs/job.ts` | Job validation; `tools` constant |
| `procs/launch.ts` | Browser lifecycle (launch, goTo, nonce, wait) |
| `procs/standard.ts` | Builders for the standard result and its instances (`outcome`, `uncertainty`, `needed`) |
| `procs/styleConsistency.ts` | Determines which style differences violate style-consistency rules |
| `procs/testAct.ts` | Performs a test act |
| `procs/testaro.ts` | `doTest` / `getBasicResult` helpers for Testaro rules |
| `run.ts` | `doJob()` — the main entry point |
| `testaro/<ruleID>.ts` | One file per Testaro rule |
| `testaro/registry.ts` | Generated map of rule IDs to rule modules (`npm run build:registry`) |
| `tests/testaro.ts` | `allRules` registry for the testaro tool |
| `validation/validateTest.js` | Core validation harness |

## License

© 2026 Jonathan Robert Pool.

Licensed under the [MIT License](https://opensource.org/license/mit/). See [LICENSE](../../LICENSE) file
at the project root for details.

SPDX-License-Identifier: MIT
