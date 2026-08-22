# Stage-3a stress report — pour on 300 real pages (2026-08-22)

Capture: `results/stage3a-2026-08-22.jsonl` — 300 pages (250 seeded-random US CrUX tail + 50
top-1000 head; `yra-100k/data/stage3a-sample-300.txt`, seed 42) × pour, axe, ed11y, qualWeb, via
the hardened URL-mode harness (per-instance element paths captured for Stage 3b). The run
completed unattended: 4 canary-triggered browser replacements, zero stalls.

## Gate verdict: PASS

| Engine | Raw ran-rate | Effective ran-rate¹ | p50 | p95 | Instances |
| --- | --- | --- | --- | --- | --- |
| pour | 96.3% | **99.0%** | 2.0 s | 7.7 s | 50,123 |
| axe | 97.0% | 99.7% | 1.7 s | 6.5 s | 32,071 |
| ed11y | 96.7% | 99.3% | 1.0 s | 4.3 s | 6,029 |
| qualWeb | 94.7% | 97.3% | 4.1 s | 13.4 s | 113,656 |

¹ Excluding the 8 pages unreachable for **every** engine (dead/hostile sites — page problems,
not engine problems). Pour's gate was ≥95%: passed on either denominator. Latency is well inside
the worker budget. No trigger-happy rule: nothing asserts on >90% of pages (max:
`target-size-enhanced`, 86% — an AAA rule where near-ubiquity is plausible; flagged for tic
quality review, not a defect).

## Prevention taxonomy (engine-specific residue is small)

Navigation failures/timeouts dominate (6–7 per engine — the dead-site class). Residue:
`navigated-during-eval` 1–3/engine (meta-refresh-class pages; results legitimately unobtainable);
reporter timeouts on 2 extremely heavy pages (pour 1, ed11y 3); qualWeb "No DOM" ×7 (its own
HTML ingestion fails on some pages — an incumbent robustness datum, not a candidate problem);
one axe adapter TypeError on one page (page-specific, pre-existing adapter code). Zero CSP
preventions — the nonce passthrough works in the wild.

## Volume anatomy — the kitchen-sink effect

Pour's headline 50k instances is dominated by AAA and best-practice rules (~30k: contrast-
enhanced 13.1k, target-size-enhanced 9.2k, region 8.1k), a direct consequence of the adapter's
run-every-rule setting (matching axe's). The A/AA-comparable picture is much closer, and on the
single biggest A/AA category the two engines nearly agree:

- **color-contrast (1.4.3): pour 8,829 instances / 74% of pages vs axe 8,795 / 76%** — near-
  identical at scale.
- link-name: pour 536/30% vs axe 660/31%. heading-order: 153/30% vs 269/32%.
- Divergences to watch in Stage 3b: `region` (pour 8.1k vs axe 2.7k — counting granularity) and
  axe's `hidden-content` (11.3k, 87% of pages — its own kitchen-sink review rule).

## Assertion-band inversion (the vendor claim, reproduced)

Of pour's instances, **72% are asserted violations** (severity 2–3) and 28% review; axe inverts:
**34% violations, 66% review/incomplete**. This independently reproduces pour.dev's "twice the
failing elements with fewer check-by-eye verdicts" claim — and it makes Stage-4 triage of pour's
*asserted* band the critical validation: pour stakes much more on definite assertions than axe
does.

## ACT-identified FP classes at real-world scale

- **Contrast** (both rules): 21.9k instances = 44% of pour's volume — the FP mechanisms found on
  ACT fixtures (symbol-only text, letter-as-icon glyphs) live inside this mass. Highest-priority
  triage sample for Stage 4.
- **Language applicability** (`valid-lang-parts`): fired on **zero** real pages — the ACT FP
  class is real but rare in the wild. `html-lang` asserts on 31 pages (10.7%) — consistent with
  WebAIM's ~13% missing-language prevalence, so likely mostly true positives.
- `button-name` 111 instances / 32 pages, `link-name` 536 / 88 pages — moderate volumes; the
  known name-computation gap (descendant `aria-labelledby`) warrants a targeted triage slice.

## Next (Stage 3b)

Per-instance element paths are already captured for all four engines. Run
`propose-tic-mappings`-style co-occurrence between pour rule IDs and the mapped incumbents'
issues over this same JSONL; disposition all 70 pour rules that fired (plus the ~16 that
didn't); then Stage-4 triage sampling with the contrast and link/button-name slices prioritized.
