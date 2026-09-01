# Certainty in the standard result: the `outcome` field

**Status:** Phase A shipped in Testaro 78.1.0 (2026-09-01). Phases B–D are recommendations for
the Testilo fork and yra-monitor, and for a later Testaro major version.
**Companion:** yra-monitor `docs/plans/engine-candidacy-pipeline.md` (Stage-1 instance policy,
Stage-3b taxonomy mapping).

## Why

Rule engines report two different things about a finding: how bad it is (impact) and whether
they are sure it is a defect (certainty). Every Testaro adapter used to fold certainty into
`ordinalSeverity`, and each did it differently:

| tool | uncertain native value | ordinal | certain native value | ordinal |
| --- | --- | --- | --- | --- |
| axe, pour, surea11y | incomplete / cantTell | 0–1 | violation / fail | 2–3 |
| htmlcs | Warning | 0 | Error | 2 |
| ibm | recommendation | 0 | violation and potential violation | 2 |
| alfa | cantTell (rule ID rewritten) | 0 | failed | 2 |
| aslint | warning | 1 | error | 2 |
| qualWeb act-rules | warning | 1 | failed | 3 |
| qualWeb best-practices | warning | 0 | failed | 1 |
| wave | alert | 0 | error, contrast | 3 |
| ed11y | dismissable warning | 0 | error | 2 |
| nuVal, nuVnu | info | 0 | error | 3 |

So severity 0 meant "definitely minor" for some tools and "possibly critical" for others, and
nothing downstream could recover certainty except by the heuristic "ordinal 2 or above means
asserted". The ACT validation harness had to read native results to score sensitivity and
specificity by certainty band. The Testilo issue classification (tic) grew 57 `*Risk` issues to
hold uncertain findings at weight 1, and its scorer counted an axe `incomplete` contrast finding
exactly like an asserted violation because it maps rule IDs only.

The two new candidate engines make the loss visible: pour separates `violations`, `incomplete`,
and `manualReview`; surea11y grades per occurrence (`fail` / `cantTell`) and publishes six
machine-readable `uncertainty` codes with a `needed` sentence saying what a reviewer must
determine.

## The model

Four dimensions, kept separate:

| dimension | meaning | where it lives |
| --- | --- | --- |
| outcome (per instance) | did the engine assert a failure, or could it not tell | standard instance, set by the adapter |
| rule certainty (per rule) | is the check deterministic, or a heuristic that can only say "suspicious" | tic tool-rule entry, as an override |
| impact (per instance) | how bad for a user | `ordinalSeverity`, once it means impact only |
| issue weight (per issue) | severity of the defect class | tic `weight` |

Certainty exists at two levels because engines both under-assert (axe `incomplete`) and
over-assert (a heuristic reported as an error). The instance level is Testaro's job; the rule
level is the taxonomy's.

## Phase A: Testaro 78.1.0 (shipped)

Every standard instance now has:

```js
{
  ruleID, what, ordinalSeverity, count, catalogIndex,   // unchanged
  outcome: 'failed' | 'cantTell',                        // required; ACT Rules Format vocabulary
  uncertainty: 'not-computable' | 'judgement-required' | 'runtime-dependent'
             | 'spec-only' | 'equivalence-unknown' | 'out-of-scope',   // optional, cantTell only
  needed: '<what a reviewer must determine>'             // optional, cantTell only, ≤ 300 chars
}
```

and `standardResult.outcomeTotals = {failed, cantTell}` (count-weighted).

- `procs/standard.js` is the one place the shape is built (`getStandardResult`, `getInstance`,
  `addInstance`, `pushInstance`). Adapters that compute `totals` from native counts (ibm, htmlcs,
  ed11y, wave, testaro) use `pushInstance`; the rest use `addInstance`.
- `ordinalSeverity` and `totals` are unchanged for every tool. The golden diff on the pour and
  surea11y validation jobs is identical after stripping the new fields.
- Per-tool mapping: axe/pour/surea11y violations → `failed`, incomplete → `cantTell`; htmlcs
  Warning → `cantTell`; ibm potential violation, potential recommendation, and manual →
  `cantTell`; alfa `cantTell` → `cantTell` (the adapter no longer rewrites the rule ID to
  `cantTell` / `cantTellTextContrast` or prefixes `what`; r66 and r69 carry
  `judgement-required`); aslint warning, qualWeb warning, wave alert, nuVal/nuVnu info →
  `cantTell`; ed11y dismissable warning → `cantTell` with `judgement-required`.
- surea11y forwards `uncertainty.code` and `uncertainty.needed` (occurrence first, then check).
  Its `confidence` value is dropped as non-portable.
- Testaro's own rules default to `failed`. An `allRules` entry may set `outcome` and
  `uncertainty` (`allCaps` is `cantTell` / `judgement-required`, consistent with the earlier
  ruling that AI confidence must not be encoded in `ordinalSeverity`). A violation description
  may carry a prefix: `2:` severity only, `2?:` severity plus `cantTell`, `?:` `cantTell` at the
  rule's default severity. `getBasicResult` accepts `outcome`, `uncertainty`, and `needed` on
  each violation.
- `validation/act/capture.js` records `outcomeTotals` and per-instance `outcome` and
  `uncertainty`, and marks a row as an error if any instance lacks a valid outcome.

Why `outcome` and not `certainty`: the ACT Rules Format and EARL already use `failed` /
`cantTell`, the ACT testcase feed the harness scores against uses `failed`, and a closed
two-value enum keeps consumer logic total. A graded `certainty` would invite scales no two
engines share and collide with surea11y's separate `confidence`.

Why `needed` is its own field: `what` is an identity key downstream (unique-issue rows, tsp
description sampling). Appending guidance to it would fracture identity across pages.

## Phase B: Testilo fork (recommended)

Tool-rule entries in the tic gain optional properties; issues gain two:

```js
tools: { htmlcs: { 'W-AAA.1_4_3.G18.BgImage': {
  variable: false, quality: 1, what: '…',
  outcome: 'cantTell',            // override; 'cantTell' is the common case
  uncertainty: 'not-computable',  // rule-level default; the instance value wins
  review: '…',                    // fallback "what to confirm" when the engine gives no `needed`
  ignore: 'invalid'               // replaces prose [invalid]/[irrelevant]/[duplicative]/[unreliable]
}}}
issue: { how: '<one imperative fix sentence>', group: 'landmarkNotTop' }
```

- Precedence: `rule.outcome` > `instance.outcome` > legacy inference > `failed`. Legacy
  inference (reports without `outcome`) is per tool: axe, pour, surea11y, htmlcs, ibm, wave,
  qualWeb → `ordinalSeverity >= 2 ? failed : cantTell`; alfa → rule ID starts with `cantTell`;
  testaro, ed11y, aslint, nuVal, nuVnu → `failed`.
- `[speculative]` becomes `outcome: 'cantTell'`; the other bracket tags become `ignore`. The
  `ignorable` pseudo-issue dissolves into per-rule `ignore`. A loader assertion rejects any
  `what` still carrying a bracket tag.
- Consolidate the 57 `*Risk` issues: merge into the base issue when one exists with the same fix
  (7 name twins plus about 11 semantic twins such as contrastRisk → contrastAA/AAA by level);
  rename (drop `Risk`) when the issue is the sole home of a defect class with a concrete fix
  (pseudoHeadingRisk → pseudoHeading, which already holds axe `p-as-heading` and takes pour's
  at `failed`; eventKeyboardRisk → eventKeyboard; labelConfusionRisk → labelPlacement with every
  rule `cantTell` / `judgement-required`); keep three page-environment advisories
  (applicationRisk, browserSupportRisk, noScriptRisk) with every rule `cantTell`. Export a
  `migrations` map (`{contrastRisk: 'contrastAA', …}`) for downstream issue-ID rewrites.
- Scoring: `cantTellWeight = 0.25` per instance inside the quality-weighted count (a weight-1
  Risk issue merged into a weight-4 base is score-neutral). Element-aware dedup: an element's
  outcome is `failed` if any tool says so, corroborated when more than one does;
  `effectiveCount = max(old per-tool max with the factor applied, element-union count)`.
  Output stays additive (`instanceCounts` numeric; add `outcomeCounts`, `elementCounts`,
  `details.elements`; `details.element` byte-identical).
- Granularity principle: one tic issue = one remediation class = one WCAG success criterion ×
  one fix. `ruleID` and `what` carry the diagnosis; certainty is never a reason to split an
  issue. Families get `group`; element-conditioned splits (pour `link-name` → image link vs text
  link) are done in the adapter with a `.`-suffixed faceted rule ID, two tic entries each.

## Phase C: yra-monitor (recommended)

Types, `tic-manager` `resolveOutcome`, scoring-service passthrough, standardized rows and DB
columns (`outcome`, `uncertainty`, `needed`) with a promote-only conflict rule (`failed` wins),
issue-ID rewrite from `migrations`, a "Needs review" badge and filter, and for `cantTell` rows
the text `instance.needed ?? rule.review ?? 'Manual review required'` under a "To confirm"
heading.

## Phase D: Testaro 79 (recommended)

Redefine `ordinalSeverity` as impact only: 0 minor, 1 moderate, 2 serious, 3 critical, which is
what yra-monitor already labels it as. `totals` keeps its shape but its composition changes
(an axe incomplete + critical finding moves from `totals[1]` to `totals[3]`). Safe only after
Phases B and C, when every consumer reads `outcome`.

## Open decisions

1. `cantTellWeight = 0.25`: confirm against Stage-4 precision on surea11y's `cantTell` band.
2. The semantic Risk merges need a "same fix?" pass; videoCaptionRisk → videoNoText and
   fieldSetRisk → fieldSetMissing are the least certain.
3. Weights for renamed heuristic issues once they can carry a `failed` band.
4. The alfa rule-ID change is visible to the current Testilo now: r66/r69 `cantTell` instances
   map to contrastAAA/contrastAA at full weight until the scorer reads `outcome`. Pin Testaro
   78.1 in the worker only together with the Phase-B Testilo.
5. Whether `unique_issues.severity` should roll up (`GREATEST`) on conflict.
