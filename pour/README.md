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

## Result shape (verified against 1.33.0)

`run()` resolves `{testEngine, url, violations, passes, incomplete, inapplicable, manualReview,
ruleTimings, durationMs}`. `violations`/`incomplete` entries are axe-style per-rule results
`{id, name, impact, tags, help, helpUrl, nodes}` with `impact` ∈ critical/serious/moderate/minor,
the WCAG criterion as a `wcag###` tag, and `nodes: [{target: [cssPath], html, failureSummary,
data?}]`. `passes` entries carry `nodeCount` only (pass nodes are not serialized).

## Pinned version

- **Vendored:** 2026-08-21
- **Upstream commit:** `64051ee` (version 1.33.0)
- **Bundle:** esbuild 0.25.x IIFE, 158 KB
- **Smoke-tested:** 6/6 seeded fixture violations detected; real-page run 25 instances in 187 ms;
  XPath resolution 100%. See yra-monitor `docs/plans/engine-candidacy-pipeline.md`.
