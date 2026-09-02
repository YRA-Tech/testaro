# Capture harness: ACT fixtures (Track A) + real-page URL lists (Stage 3)

Two page sources share one hardened capture loop (deadline-raced browser operations, wedge-
signature browser replacement, resume-from-output): the default ACT-fixture mode described
below, and `--urls <file>` mode (one URL per line, `#` comments) for real-world captures — used
by the engine-candidacy pipeline's Stage-3 stress/mapping run. URL mode additionally records
per-instance element paths (`instances: [{ruleID, severity, xPath}]`, capped at 2,000/row) for
element-level co-occurrence, and captures the page's CSP script nonce so script-injecting
adapters can reuse it (mirroring the production launch proc's `jobData.lastScriptNonce`).

Runs tool reporters over the [W3C ACT-Rules test cases](https://www.w3.org/WAI/standards-guidelines/act/rules/)
— ~1,200 tiny fixture pages with expected outcomes (passed / failed / inapplicable) per ACT rule —
and scores each engine's per-rule **sensitivity and specificity** against that ground truth. This
is Stage 2 ("fixture confusion matrix") of the engine-candidacy pipeline; see yra-monitor
`docs/plans/engine-candidacy-pipeline.md`.

Capture and scoring are separate so the expensive browser pass never repeats to try a different
scoring policy:

```sh
# cwd must be the repository root (tool assets resolve relative to it).
node validation/act/capture.js --engines pour,axe --match "image|button|link" \
  --out validation/act/results/run.jsonl
node validation/act/score.js --in validation/act/results/run.jsonl --band asserted
```

- `capture.js` — downloads/caches the testcase feed, navigates each fixture, replicates the
  launch-proc environment each engine needs (`window.getXPath` injection; `data-xpath` stamping
  for attribute-need engines), runs each reporter with a per-act time limit, and appends one JSONL
  row per testcase × engine with raw findings: engine rule-ID counts, `outcomeTotals` (standard
  instances by outcome `failed` / `cantTell`), plus per-criterion `asserted` (violation band)
  and `review` (incomplete band) counts. Filters: `--rules id,id`,
  `--match nameRegex`, `--max N`.
- `score.js` — computes the confusion matrix. An ACT rule's positive criteria are its
  `forConformance` WCAG 2.x success criteria; an engine flags a testcase when it reports ≥1
  finding on any of them (`--band asserted|review|both`). `failed` testcases are the positive
  class; `passed` + `inapplicable` the negative class. Prints markdown tables; `--json` writes the
  full report.

Criterion-level matching is the v1 comparability layer, and its biases are stated wherever
results publish: a finding on the right criterion from an unrelated check still counts
(generous), and a real finding reported under a different criterion does not (strict). Engine
rule-IDs are captured raw, so an exact engine-rule → ACT-rule mapping can refine scoring later
without recapturing. Criterion extractors exist for `pour` and `axe` (both tag findings with WCAG
criteria natively); other engines record rule IDs and instance counts until an extractor (or a
tic-based criterion map) is added.
