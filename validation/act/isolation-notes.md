# Long-lived-browser injection failure — evidence log (2026-08-22)

Motivation beyond this harness: production testaro launches a fresh browser per test act because
of recurring spurious test-isolation bugs, at a large throughput cost. Anything learned here about
what long-lived-browser state actually breaks — and what level of recycling (context vs browser)
resets it — bears on whether that cost can be reduced.

## The incident

Full ACT capture (1,213 testcases × pour + axe, one Chromium browser + one context for the whole
run, fresh page per testcase × engine, pages closed after use). From testcase 274 — exactly the
first fixture of rule `7d6734`, immediately after the last `c487ae` fixture — **every** pour row
for the remainder of the run (940 rows) failed the same way: script element inserted, no
exception, `pourEngine` global never defined. Axe, whose adapter executes via `page.evaluate`
instead of a `<script>` tag, kept detecting instances to the final row. No recovery for ~940
consecutive pages over ~13 minutes.

## Experiments

| # | Setup | Result |
| --- | --- | --- |
| 1 | Fresh process, the boundary fixtures (`7d6734`, `afw4f7`) | All pass — fixtures innocent in isolation |
| 2 | 700 cycles, local benign fixtures, one browser, axe-style page interleaved (data-xpath stamping + axe evaluate), no recycling | 0 failures, flat RSS — page count + interleave alone insufficient |
| 3 | Full-feed pour re-capture, browser recycled every 100 testcases, no axe interleave | Clean through the entire former cliff region (34/34 on `7d6734`/`307n5z`/`a25f45`) |
| 4 | Cliff-neighborhood replay (`c487ae`→`a25f45`, 69 testcases), pour + axe interleaved, **no recycling**, fresh process | 69/69 clean — the fixture region + interleave is not a deterministic trigger |
| 5 | Full-feed pour-only recapture, hardened harness, solo machine, recycling every 100 | **Cliff recurred**: 41 consecutive rows dead starting mid-`1a02b0` (video-transcript fixtures) — in a browser only ~36 pages old. Rules out cumulative-pages-per-browser; the concurrent-load theory weakens too (run was solo). |
| 6 | Meta-refresh(0) fixtures, local repro (`repro-metarefresh.js`): goto → evaluate (interrupted by the refresh navigation) → `page.close()` | **`page.close()` hangs indefinitely** — never resolves, never rejects — on ~half the rounds, on both a single-redirect page and an a→b→a redirect loop. Playwright 1.62.1, Chromium headless. The context stays usable for *new* pages afterward. Independently, both full captures wedged at exactly the first `bc659a` ("Meta element has no refresh delay") fixture — its passed examples are `content="0; URL=…"` immediate redirects — frozen >35 min in an untimeouted `await page.close()`. |
| 7 | Replay of the recurrence region (`1a02b0`,`2ee8b8`,`59br37`, 61 testcases), no recycling, fresh process | 61/61 clean — the video region is not a deterministic trigger either. |
| 8 | Wedged-browser aftermath (from the bc659a incident): `newPage` on the wedged browser | Throws `Protocol error (Target.createTarget): Not supported`, then `Target page, context or browser has been closed` once the process dies — a recognizable signature usable as a replace trigger. A deadline-only trigger let 73 rows (pour) / 886 rows (qualWeb) fail before the next scheduled recycle. |

## Conclusion: probabilistic wedge events, answered by canary-triggered recycling

The injection cliff is **nondeterministic**: it recurred at a different position in a nearly-new
browser on a quiet machine, and every regional replay of a cliff neighborhood comes back clean.
Best model: races between fixture-initiated behavior (media load, client-side navigation) and
harness operations occasionally wedge browser-wide `<script>`-element execution — same family as
the reproducible close() hang, at roughly 1–2 events per ~1,200 real-page cycles. Chasing a
deterministic trigger further has diminishing value; the effective countermeasures, all now in
`capture.js`, are:

1. **Deadline-race every browser-touching await** (nothing can hang the loop);
2. **Canary assertions** (expected tool global present on text/html pages);
3. **Replace the browser on any wedge signature**: tripped deadline, `Protocol error
   (Target.createTarget)`, "has been closed", or a failed canary.

## Upstream status (2026-08-22)

- Playwright: filed as <https://github.com/microsoft/playwright/issues/42366> (likely duplicate
  of #42068, which the team milestoned v1.63); **fix PR submitted:**
  <https://github.com/microsoft/playwright/pull/42367> (bounded re-issue of `Target.closeTarget`
  in `CRBrowser._closePage` + stale-fixme removal; their close-related suites pass 41/41).
  Note: Playwright's rolled Chromium 152.0.7977.54 narrows the race window sharply through
  Playwright's call timing (their reload-trigger test passes 6/6 unpatched), but raw CDP still
  reproduces the contract violation on 152 (~2/10) — so channel builds (Chrome/Edge stable,
  151-class, 70–80% hit rate) remain the population the guard protects.
- testaro: `browserClose` hardened with a 10 s settle-deadline per close (try/catch cannot catch
  non-settlement) — PR <https://github.com/YRA-Tech/testaro/pull/92>. (Discovered en route:
  jrpool/testaro now redirects to YRA-Tech/testaro — the repo was transferred, so #92 IS the
  upstream PR.) The same patch is applied to the working tree used by the harness.
- Chromium: already tracked as <https://issues.chromium.org/issues/536385539> (filed 2026-07-19
  by a Google engineer; P2/S2; **pending code change 8251379**). Their C++ root cause matches our
  protocol-level one exactly: `WebContentsImpl::ClosePage` arms the close on the current main
  RenderFrameHost; a racing navigation commit swaps the RFH; the pending `ClosePage` callback
  dies with the old RFH and is never re-issued. Our meta-refresh(0) trigger, hit rates, and
  workaround matrix posted there as comment #2; both issues cross-linked. Practical upshot for
  testaro: a fix is in flight upstream, but the deadline+canary+context-recycle defenses remain
  necessary until it ships in a released Chromium — and for the injection cliff, which has no
  upstream issue yet.

## Discovery #2 — root-caused (2026-08-22 evening)

A `DEBUG=pw:protocol` trace of a hanging round shows the full mechanism: Playwright sends
`Target.closeTarget`, Chromium replies `{"result":{"success":true}}`, but the target — mid-commit
in the meta-refresh navigation — never closes; the same session then emits the redirect
destination's entire load lifecycle after the "successful" close, `Target.targetDestroyed` never
fires, and `page.close()` waits for it forever. Chromium acknowledges a close it does not
perform; Playwright trusts the acknowledgment with no timeout.

Matrix (10 rounds/cell): **Chromium-only** (Firefox 153 and WebKit: 0/10 everywhere), and
**default `close()` only** — `close({runBeforeUnload: true})` 0/10, `context.close()` 0/10.
After a hang, `context.close()` still settles and destroys the page (**8/8 recoveries**).

The recovery result upgrades the production recommendation: for this wedge class,
**context-level teardown is a sufficient and reliable recovery** — no browser relaunch needed
(~10 ms vs ~300 ms). A pooled-browser testaro could run context-per-act with deadline-raced
closes, escalating to browser replacement only if the context teardown itself trips its
deadline. (The injection cliff's recovery level remains untested — it is not reproducible on
demand — so the escalation path should stay.)

## Discovery #2 (original observation): page.close() can hang forever after a meta-refresh navigation

This is a second, *reproducible-at-will* failure mode, distinct from the injection cliff but in
the same family (navigation racing teardown corrupts page state):

- Signature: `close()` neither resolves nor rejects, so `await page.close().catch(...)` blocks
  forever — `.catch` guards rejection, not non-settlement. A loop with no deadline around close
  freezes permanently, silently.
- Nondeterministic (~50% of rounds locally): it is a race with the refresh-triggered navigation,
  which also explains why one run passes a fixture another run wedges on.
- No matching upstream issue found (2026-08-22 search); nearest family member is
  [playwright#33806](https://github.com/microsoft/playwright/issues/33806) (hangs waiting for
  pending navigations). **Fileable** with `repro-metarefresh.js` (~40 lines, local pages, no
  external deps beyond playwright + any large script to inject — the script is incidental).
- Harness guard shipped in `capture.js`: every browser-touching await is raced against a
  deadline (`withDeadline`), a tripped deadline presumes a wedged browser and replaces it
  (`replaceBrowser`, itself deadline-guarded), and captures resume by skipping rows already in
  the out file. Verified against the live `bc659a` fixtures: one real close-hang tripped the 5 s
  deadline, the browser was replaced, and all 15 fixtures completed.

### Production translation (testaro)

Pages that navigate during scanning (meta refresh is common on real sites) can hang `close()`
forever. In a browser-per-act world the leaked hang is bounded by the act's child process exit;
in any pooled/long-lived design it is fatal without deadlines. Concretely: (1) every
`page.close()`/`browserClose()` should be deadline-raced, (2) a tripped deadline should recycle
the browser, not just the page, and (3) the meta-refresh fixture class belongs in any isolation
test suite as the canonical wedge-inducer.

The overall answer to "could testaro keep a browser across acts?": the observed isolation
failures here were **rare, probabilistic wedge events with recognizable signatures**, not
gradual deterministic leakage. That favors a middle path over browser-per-act: pool the browser,
assert a cheap per-act canary (script-injection round-trip + expected globals), and recycle the
browser only on a wedge signature or every N acts — the three-countermeasure pattern above,
already exercised at ~1,200-page scale by this harness. The remaining unknown for production is
whether *cross-page contamination* (state leaking between scanned pages, distinct from wedges)
also occurs; this harness's same-tool-different-page design cannot see that class, so a pooled
design should keep context-per-act (cheap) even if the browser is shared.

## Explained failure classes (distinct from the cliff)

- `contentType application/xml` fixtures: `document.createElement('script')` in an XML document
  creates a null-namespace element that never executes — expected, benign, now visible via the
  adapter's diagnostic error (content type, script chars, ready state).
- "Resulting promise was garbage collected": fixtures that navigate (meta refresh) during the
  in-page evaluate. All observed on `inapplicable` testcases.

## Current best theory

Not page count, not the axe interleave, not any single fixture so far: either (a) cumulative
state that only the full 273-testcase real-page history builds up, or (b) a nondeterministic
in-browser event (renderer/helper-process crash or OOM kill — the host was carrying ~31 GB of
desktop Chrome RSS during the incident) that wedges `<script>`-element execution while leaving
CDP `evaluate` execution intact. All fixtures being same-origin (`www.w3.org`) means Chromium packs
them into shared renderer processes, which is consistent with one wedged process poisoning every
subsequent same-origin page.

## Production relevance (testaro browser-per-act)

- The failure mode was **silent** — no exception anywhere; only an output-level check (expected
  global absent) caught it. Any move away from browser-per-act needs a per-act canary assertion
  of this kind, not just error handling.
- Recycling every N acts (experiment 3) is so far sufficient as a guard and is the cheap middle
  ground between browser-per-act and browser-forever; whether *context*-per-act (much cheaper
  than browser launch) also resets the poisoned state is untested — worth adding
  `--recycle-context` bisection if experiment 5 reproduces the cliff.
- If experiment 5 comes back clean, the honest conclusion is: one observed environmental
  incident in ~5,000 page-cycles, mitigated by periodic recycling — suggestive that testaro's
  isolation bugs may likewise be rare wedge events rather than deterministic leakage, which would
  argue for recycle-on-anomaly (canary-triggered) rather than always-fresh browsers.
