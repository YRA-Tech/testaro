# Vendored Pour Engine bundle

Upstream: [pourdev/pour-engine](https://github.com/pourdev/pour-engine) (MIT, zero-dependency,
ES modules only — no dist build is published, so we bundle it ourselves into the IIFE that
`tests/pour.js` injects).

## Build

From a checkout of the upstream repo at the pinned commit:

```sh
npx esbuild engine/index.js \
  --bundle --minify \
  --format=iife --global-name=pourEngine \
  --outfile=pour.min.js
```

Copy `pour.min.js` into this directory. The bundle must expose a `pourEngine` global with
`{run, name, version}`; `tests/pour.js` reports the act as `prevented` if the file is missing or
the global is absent.

At vendor time, verify the native result field names extracted in `tests/pour.js` (`flatten()`)
against the actual bundled version's output, and update the pinned-version table below.

## Result shape (verified against 1.37.0)

`run()` resolves `{testEngine, url, violations, passes, incomplete, inapplicable, manualReview,
ruleTimings, durationMs}`. `violations`/`incomplete` entries are axe-style per-rule results
`{id, name, impact, tags, help, helpUrl, nodes}` with `impact` ∈ critical/serious/moderate/minor,
the WCAG criterion as a `wcag###` tag, and `nodes: [{target: [cssPath], html, failureSummary,
data?}]`. `passes` entries carry `nodeCount` only (pass nodes are not serialized).

## Pinned version

- **Vendored:** 2026-09-01
- **Upstream commit:** `575bc95` (tag `v1.37.0`)
- **Bundle:** esbuild 0.28.2 IIFE, 206 KB
- **Smoke-tested:** 8/8 seeded violations detected (image-alt, button-name, form-label,
  positive-tabindex, heading-order, html-lang, document-title, color-contrast); webaim.org
  validation job identical to the 1.33.0 run (90 instances, 38 failed / 52 cantTell, 100%
  catalog resolution). Upstream changes 1.33 → 1.37 refine ARIA required-parent/child and
  required-state tables and move whitespace-only alt to review; result shape unchanged.

### History

- 2026-08-21: `64051ee` (1.33.0), esbuild 0.25.x, 158 KB. 6/6 seeded fixture violations;
  real-page run 25 instances in 187 ms. See yra-monitor `docs/plans/engine-candidacy-pipeline.md`.
