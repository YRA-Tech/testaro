# Checkpoints: scanning across a serial action flow

**Status:** Phases 0, 1, and 1b shipped in Testaro 78.2 (2026-09-02); Phases 2 (`report.flow`)
and 3 (`scope: 'changed'`) shipped in 78.3 (2026-09-02). Phase 4 (incremental pruning) and the
interaction modalities remain follow-ups.

## Why

A job is a serial list of acts: launch a browser, interact with the page, test it. Until 78.2,
the interaction acts had no effect on any test: every `test` act ran in a child process that
launched its own browser and navigated to the job target, and the element catalog was built
once, before any act, for that same page. A job of the form launch → click → test therefore
tested the page as first loaded, and any test after a `url` act resolved its elements against
the wrong page's catalog.

The maintainer's goals: keep the serial action flow; keep or extend a running list of found
issues as the flow progresses; use explicit triggers for re-scanning rather than re-running
every tool after every action; and re-scan either the whole page or only the parts that
changed, as the case requires.

## The model

A **checkpoint** is a named page state reached by the flow, snapshotted and tested:

- **Checkpoint 0** is the job target as launched. `getCatalog` creates it before any act, as
  it always built the catalog, and records it as `report.checkpoints[0]` (named `start`).
- A **`checkpoint` act** (`{type: 'checkpoint', which: '<name>'}`) creates the next one from
  the live page in the parent process: catalog entries for the current state, page image(s)
  if the job asks for them, the URL and title, an ARIA snapshot, and a DOM digest.
- A **`test` act belongs to the most recent checkpoint** (`act.checkpoint`), and every
  standard instance it reports carries `checkpoint`.

Checkpoint mode is opt-in: it is on only when the job contains a `checkpoint` act. Legacy
jobs (no such act) run as before and produce today's report plus the `checkpoint: 0` fields;
if interaction acts precede a test act in a legacy job, `jobData.warnings` says that the act
tests checkpoint 0. In checkpoint mode, interaction acts followed by a test act without an
intervening checkpoint produce an implicit checkpoint (named `act<N>`) and a warning; the
warning never fails the job.

### Navigation and interaction checkpoints

A checkpoint is a **navigation checkpoint** when the page was reached by navigation alone
(a `launch` or `url` act) and no interaction act ran since; it is an **interaction
checkpoint** when acts on a page (button, link, text, press, reveal, …) reached it. The
distinction decides how a test act's browser reaches the state:

- Navigation checkpoint: the child navigates to the checkpoint's URL. Every tool runs.
- Interaction checkpoint: the child navigates to the URL the interaction started from
  (`launchURL`) and **replays** the recorded interaction acts (`replay`, act indexes) before
  running the tool. The replay happens inside `launchOnce` after navigation and before any
  `data-xpath` stamping, so elements the acts reveal or create are stamped like the rest,
  and every per-rule relaunch of a contaminating testaro rule replays automatically.

Replay is a re-enactment, not a restore. Server state, sessions, timers and randomness can
make the replayed DOM differ from the snapshot. Each test act records
`data.replay = {checkpoint, acts, elapsedMs, fidelity}` where `fidelity` is `exact` when
the replayed DOM's digest equals the checkpoint's, else `divergent`. A replay failure
prevents the test act with `checkpoint replay failed at act N (…)` and is not retried.

### What each tool can observe

`procs/job.js` `toolInputs` declares what a tool tests:

| input | tools | interaction checkpoints |
| --- | --- | --- |
| `page` | alfa, aslint, axe, ed11y, htmlcs, ibm, pour, surea11y, testaro | yes (replayed page) |
| `html` | qualWeb, nuVal, nuVnu (they read the live page's HTML) | yes (replayed page) |
| `url` | wave; nuVal and nuVnu with `withSource: true` | no: prevented with a stated reason |

### Report shape

- `report.checkpoints[k]`: `{index, name, implicit, actIndex, launchActIndex, launchURL,
  replay, interaction: {modality}, kind: 'navigation' | 'interaction', url, title,
  imageIndexes, catalogRange, elementCount, ariaSnapshot, domDigest, elapsedMs, testActs}`.
- `report.catalog` stays one flat map. Entries carry `checkpoint`; indexes come from a
  monotonic job-time counter (`report.catalogNextIndex`), so entries of different checkpoints
  never collide, and the job-time `report.pathIDs` is scoped per checkpoint so the same XPath
  in two states maps to two entries. Pruning keeps only cited entries, as before.
- `report.images`: `images[0]` (and `[1]` at `imageScale > 1`) keep meaning checkpoint 0;
  later checkpoints' images are indexed by `checkpoints[k].imageIndexes`. The testaro `motion`
  rule compares against its checkpoint's image.
- `jobData.catalogData.checkpoints[k]`: element and entry counts per checkpoint.
- `report.flow` (two or more checkpoints): `{checkpoints: [{index, name, kind, url, actIndex,
  testActs, tools, issueCount}], deltas: [{from, to, tools, notObserved, added, persisted,
  removed, structure, aria}]}`; each issue is `{tool, ruleID, pathID, startTag, what,
  ordinalSeverity, outcome, count, actIndexes}`.
- Test acts: `scope` (`page` default or `changed`) and `data.scope = {requested, applied,
  reason, roots, pathIDs, commonRoot, localRules?, pageRules?}`. Job-time only, deleted by
  `pruneCatalog`: `report.scope`, `report.ruleScopeRoots`.
- Progress events: `checkpointStart` and `checkpointEnd` (with `kind` and `elapsedMs`);
  `actEnd` carries `checkpoint`.

### Interaction modality (planned)

The act executors live in `procs/actDo.js` and take an `interaction` option
(`{modality: 'efficient'}` today), recorded on each checkpoint so replay uses the same
modality. Low-level events (`mousedown`/`mouseup`), emulated human mouse travel and key
pauses, and pass-to-pass comparisons between modalities are designed to slot in there.

## Phases

- **Phase 0 (shipped):** act-loop repairs (`next` acts, failed launches, the `url` and
  `state` acts), `procs/actDo.js`, `procs/xPathScript.js`, `catalogPage`, checkpoint 0.
- **Phase 1 (shipped):** the `checkpoint` act, `procs/checkpoint.js`, replay in the
  launcher, implicit checkpoints, tool gating, the `validation/tests/jobProperties/checkpoint`
  validator with report-level expectations.
- **Phase 1b (shipped):** the `isolation` job property (or the `ISOLATION` environment
  default): `process` (the default: a child process and browser per test act), `browser`
  (one browser shared by the job's launches, a fresh context per test act, replay), `page`
  (tools run in sequence in the job's process on the live checkpoint page, no replay;
  contaminating testaro rules still get a fresh context with replay). `procs/testAct.js`
  performs a test act for both the child process and the in-process levels; the launcher
  keeps the shared browser and prepares a live page (XPath script or attributes, accessible
  names) without changing its DOM. Recorded in `jobData.isolation`. Only `process` can kill a
  tool that overruns its time limit; the others report the act as timed out and continue.
- **Phase 2 (shipped):** `report.flow` (`procs/flow.js`, `getFlow(report)`), added at job end
  before pruning when the job has two or more checkpoints, and usable standalone on a stored
  report (the structure diff then covers cited elements only). `flow.checkpoints[k]`
  summarizes each checkpoint; `flow.deltas[k - 1]` compares checkpoints `k - 1` and `k`:
  `added`, `persisted`, and `removed` issues with identity `tool | ruleID | pathID | startTag`
  (box and text excluded, since layout and copy shift without the defect changing; a summary
  instance has an empty element key), compared only for the `tools` that observed both
  checkpoints with a non-prevented act (`notObserved` lists the rest); `structure`, the
  catalog diff (`procs/scope.js`, `getStructureDiff`): `added`, `removed`, and `changed`
  (start tag) XPaths, `textChanged` XPaths, and `roots`, the outermost changed elements (the
  nearest surviving ancestor stands for a removed element; a text change counts only where no
  descendant changed, because the catalog text of an element includes its descendants'); and
  `aria`, a line diff of the ARIA snapshots (`diff`, the jsdiff library yra-monitor also uses;
  at most 500 changed lines recorded, `truncated` otherwise).
- **Phase 3 (shipped):** `scope: 'page' | 'changed'` on test acts (`actSpecs.js`; a job with a
  changed-scope act must have a checkpoint act). Before such an act the acts loop calls
  `getChangedRoots(report, k)`, which converts the structure roots of the diff between
  checkpoints `k - 1` and `k` to CSS selectors (`/html/body/main[1]/div[2]` becomes
  `html > body > main:nth-of-type(1) > div:nth-of-type(2)`, exact because `getXPath`
  subscripts among same-tag siblings, which is what `nth-of-type` counts) and gives them to
  the tool as the job-time `report.scope` when the tool is in `toolScopes` (`procs/job.js`:
  axe, surea11y, testaro). The act records `data.scope`; when the act cannot be scoped (no
  previous checkpoint, no change, more than `maxRoots` = 50 roots, an XPath with no selector,
  a tool without a root option) it tests the whole page with `applied: false` and a reason,
  and `jobData.warnings` says so. axe takes the roots as its `include` context; surea11y takes
  the nearest common ancestor of the roots (`commonRoot`), since its context is one selector;
  the testaro tool sets `report.ruleScopeRoots` per rule to the roots for a rule with
  `local: true` in `allRules` and to null otherwise, and `doTest` keeps only candidates inside
  a root (`getBasicResult` rules, hover and role, are not local). The conservative first-pass
  classification marks as not local: allHidden, bulk, docType, dupAtt, headEl, headingAmb,
  secHeading, linkAmb, labClash, radioSet, styleDiff, targetsNear, title, motion, role, hover,
  hovInd, focAll, focAndOp, focInd, focVis, tabNav, buttonMenu, elements, textNodes. Whether a
  partial scan is valid is not automated; the author chooses per act, and the rule metadata
  protects the choice. Limits: the diff is by XPath, so inserting one sibling shifts later
  same-tag indexes and the changed set can grow to the container (correct but coarse); a
  changed-scope act finds only defects inside the roots, so `flow` unions the findings of every
  act at a checkpoint rather than trusting one act.
- **Phase 4 (follow-up):** prune checkpoint `k`'s uncited entries when checkpoint `k + 1` is
  created, bounding the temp-report size; map yra-monitor user-path `checkpoint` actions 1:1
  to `checkpoint` acts.

## Relationship to yra-monitor

yra-monitor's DOM-difference feature captures outerHTML, a screenshot, element positions
and the ARIA snapshot per URL per scan and diffs them across scans. Checkpoints capture the
same artifacts per page state inside one job. The cross-scan history and comparison UI stay
downstream; a later consolidation can store Testaro's checkpoint-0 artifacts instead of
launching a separate capture browser.

Until yra-monitor carries `checkpoint` and the checkpoint URL on stored rows, adds a
checkpoint dimension to its unique-issue key and auto-resolve scoping, and stores one
screenshot per checkpoint, multi-checkpoint reports must not be fed through its scan
ingestion path.
