# Chromium bug report — Target.closeTarget acks success without closing during navigation commit

**NOT FILED as a new issue — already tracked upstream.** Pre-filing search (2026-08-22) found
<https://issues.chromium.org/issues/536385539> (filed 2026-07-19 by a Google engineer, P2/S2,
pending code change 8251379): `Target.closeTarget` is lost when a navigation commit swaps the
main RenderFrameHost right after `ClosePage` — the pending `ClosePage` callback dies with the
old RFH and is never re-issued. Same defect; their trigger was back-to-back failing navigations,
ours (meta-refresh 0) is an additional ordinary-page trigger of the same race.

**Actions taken instead:** corroborating comment posted as comment #2 on 536385539 (meta-refresh
trigger, raw-CDP hit rates, workaround matrix, link to
<https://github.com/microsoft/playwright/issues/42366>); issue upvoted; cross-link comment added
on the Playwright issue. Repro retained here: `repro-cdp-raw.js`.

The draft below is preserved for reference (its evidence went into the comment).

---

**Title:** Target.closeTarget returns success:true without closing the target when the close
races a client-side (meta refresh) navigation commit; no Target.targetDestroyed is ever emitted

## Environment

- Chromium 151.0.7922.34, `--headless=new`, Linux
- Raw CDP over WebSocket (no client library — reproduces identically through Playwright 1.62.1,
  where it strands `page.close()` forever)
- Not reproducible in Firefox or WebKit equivalents

## Steps

1. Create a target and navigate it to a page carrying
   `<meta http-equiv="refresh" content="0; URL='/target.html'">` (immediate client-side
   redirect).
2. Leave a `Runtime.evaluate` (`awaitPromise: true`) in flight for the refresh navigation to
   destroy.
3. ~45–60 ms after the navigate (during the refresh navigation's commit window), send
   `Target.closeTarget {targetId}` on the browser session.

Reproduction rate ~3/10 rounds with the attached script (a timing race; the script sweeps the
window).

## Expected

Either the target closes — `Target.targetDestroyed` fires and the target disappears from
`Target.getTargets` — or `closeTarget` reports `success: false`/an error.

## Actual

`closeTarget` returns `{"result":{"success":true}}`, but:

- no `Target.targetDestroyed` is ever emitted for the target;
- the target remains listed in `Target.getTargets`;
- the target proceeds to fully load the redirect destination (frameNavigated,
  DOMContentLoaded, load, paint lifecycle events all arrive *after* the successful-looking
  close acknowledgment).

A second `Target.closeTarget` for the same target afterwards does close it, as does closing its
browser context — the target is not stuck, the close was simply dropped.

## Impact

Any CDP client that treats `success: true` as "the target will be destroyed" waits forever.
Playwright's `page.close()` does exactly this: its promise resolves on target destruction, so
automation against pages using meta-refresh (common in the wild; the W3C ACT-Rules bc659a
"passed" fixtures are examples) hangs nondeterministically with no error. Observed at ~70–80%
per attempt via Playwright's timing on real fixture pages.
