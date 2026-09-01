# Track A — surea11y, full ACT run (2026-09-01)

Capture: `results/surea11y-full-2026-09-01.jsonl` (1,213 testcases, 1,196 ran, 17 prevented —
the known redirecting-fixture class). Scored `--band asserted`;
`results/surea11y-full-2026-09-01-asserted.json`. Comparison figures are the merged
2026-08-22 full run (`merged-full-2026-08-22-asserted.json`), same fixtures, same
criterion-level scoring layer for pour/axe/surea11y (qualWeb keeps its native-ACT scoring
advantage).

## Aggregate (any-engine detection subset — 47 rules with surea11y included, was 43)

| Engine | Sensitivity | Specificity | TP | FN | FP | TN |
| --- | --- | --- | --- | --- | --- | --- |
| qualWeb | 85.9% | 99.1% | 213 | 35 | 5 | 527 |
| **surea11y** | **68.6%** | **92.0%** | 151 | 69 | 37 | 425 |
| pour | 51.1% | 91.7% | 112 | 107 | 37 | 407 |
| axe | 33.2% | 96.0% | 73 | 147 | 19 | 453 |

surea11y clears the Stage-2 gate: specificity ≥ incumbent median, and sensitivity is the
best of any criterion-layer engine — +17.5 points over pour at equal specificity.

## Net-new coverage

Sole detector across all four engines: `e88epe` (image not in accessibility tree is
decorative — 20% sens, but nobody else scores at all).

Detects where pour misses (7): the three **1.4.12 text-spacing** rules (24afc2 / 78fd32 /
9e45ec, all 100/100 — ACT-fixture confirmation of the same novelty pour's Stage-3b flagged
in the wild), **b33eff orientation lock** (100/100), **bisz58 meta-refresh no-exception**
(100/100), akn7bn iframe tab-order, e88epe.

Misses where pour detects (3): aizyf1 (link is descriptive — pour's marquee sole-source
stays unique to pour), 6cfa84 (aria-hidden focusable content), 80f0bf (auto-playing audio).
**The engines are complementary, not redundant** — each keeps sole-source value if both
were adopted.

## FP hotspots (Stage-3 should measure their in-the-wild rates)

| ACT rule | FP | Note |
| --- | --- | --- |
| 4b1c6c iframe identical accessible names | 11 (TP 2) | Dominant FP class — over-asserts equivalence judgments the fixture set treats as `cantTell` territory |
| ucwvc8 page-language subtag matches content | 4 (TP 0) | Same lang-heuristic FP class pour had; pour's Stage-3a showed it ~absent in the wild |
| e086e5 / 2t702h / akn7bn / qt1vmo / bc4a75 / e88epe | 2–3 each | Small; triage with Stage-3 rates |

## Verdict

Stage-2 gate **passed**. Next per pipeline: Stage-3 capture over the evaluation slice
(`--urls yra-100k/data/stage3a-sample-300.txt`, engines surea11y + incumbents) — ran-rate,
latency distribution, trigger-happy screen, and the 4b1c6c FP class's real-world rate; then
3b mapping bootstrap off the same capture.
