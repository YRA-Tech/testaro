# Vendored SureA11y core bundle

Upstream: [SureA11y/core](https://github.com/SureA11y/core) (`@surea11y/core` on npm,
**MPL-2.0** — file-level copyleft: modifications to the vendored file itself must remain
MPL-2.0; the rest of this repo is unaffected. The bundle is vendored verbatim, unmodified).

## Vendoring

No build step: upstream publishes a self-contained standalone browser bundle. To vendor or
update:

```sh
npm pack @surea11y/core@<version>
tar xzf surea11y-core-<version>.tgz
cp package/surea11y.browser.js surea11y/surea11y.browser.js
```

The bundle defines one global, `a11ycore`, exposing `runa11yCoreInPage(pageUrl,
contextSelector, engineOptions, runOnly)`; `tests/surea11y.js` reports the act as `prevented`
if the file is missing or the global is absent. English-only by design (locale side files
exist upstream; not vendored).

## Result shape (verified against 1.7.0, schemaVersion 1.0.0)

`runa11yCoreInPage()` returns `{engine: {tag: 'a11ycore', schemaVersion, wcagVersion},
checksResults, rulesResults, ...}`. Each `checksResults` entry:
`{ruleId, outcome: pass|fail|cantTell|notApplicable, severity: minor|moderate|serious|critical,
confidence, type: automatic|manual, occurrences, title, meta: {normativeMappings:
[{standard, version, requirement, ...}], ...}}`. Occurrences carry `{selector, html, summary,
occurrenceOutcome?: fail|cantTell, uncertainty?}` — a `fail`-outcome rule may grade individual
occurrences into `cantTell` tier via `occurrenceOutcome`, which the adapter honors
per-occurrence. `pass` results serialize no occurrences; `notApplicable` may carry one
scan-describing occurrence (empty selector) which the adapter must not count. Full contract:
upstream `docs/OUTPUT_SCHEMA.md` (pinned to `schemaVersion` — the adapter reports `prevented`
on a major schema change is NOT automatic; re-verify at each vendor bump).

## Pinned version

- **Vendored:** 2026-09-01
- **Upstream:** `@surea11y/core` 1.7.0 (npm tarball, published bundle used verbatim)
- **Bundle:** 749 KB standalone browser IIFE, global `a11ycore`
- **Smoke-tested:** see yra-monitor `docs/plans/engine-candidacy-pipeline.md` candidate
  register for Stage-1 results.
