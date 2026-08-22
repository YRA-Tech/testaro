# Playwright bug report — page.close() never settles after meta-refresh navigation

**FILED 2026-08-22: <https://github.com/microsoft/playwright/issues/42366>**
Minimal repro: `repro-metarefresh.js` in this directory (self-contained, local HTTP server).
Chromium side: already tracked as <https://issues.chromium.org/issues/536385539> (pending code
change 8251379); cross-linked in both directions 2026-08-22 — see `chromium-issue-draft.md`.

---

**Title:** [Bug]: page.close() hangs forever — Chromium's Target.closeTarget returns success:true
without closing a target that is mid-commit in a client-side (meta refresh) navigation

## System info

- Playwright Version: 1.62.1 (latest at time of report)
- Operating System: Linux (7.0.0-30-generic)
- Browser: Chromium (bundled, HeadlessChrome/151.0.7922.34) — **Chromium only**; Firefox and
  WebKit are unaffected (0/10 each in the same harness)
- Other info: Node 24.14.1

## Repro

1. Serve a page with `<meta http-equiv="refresh" content="0; URL='/target.html'">` (immediate
   client-side redirect; the W3C ACT-Rules bc659a "passed" fixtures are real-world examples).
2. `page.goto(url, {waitUntil: 'load'})` — resolves.
3. `page.evaluate(...)` — rejects with "Execution context was destroyed" (expected; the refresh
   navigation fired mid-evaluate).
4. `await page.close()` — **hangs on ~70–80% of rounds** (8/10, 7/10 across runs): the promise
   never resolves and never rejects. `.catch()` never fires; a loop awaiting it freezes forever.

## Root cause (from a `DEBUG=pw:protocol` trace of a hanging round)

- Playwright sends `Target.closeTarget {targetId}`.
- The browser replies `{"result":{"success":true}}`.
- The target does not close: the meta-refresh navigation was mid-commit, and the same session
  then emits the full lifecycle of the redirect destination — `Page.frameNavigated`,
  `DOMContentLoaded`, `load`, paint events, `networkIdle` — all *after* the successful-looking
  `closeTarget` response.
- `Target.targetDestroyed` is never emitted; `page.close()` waits for it indefinitely.

So Chromium acknowledges the close without performing it when the close races a navigation
commit, and Playwright trusts the acknowledgment with no timeout or retry.

The browser-side half is confirmed **without Playwright**: a raw-CDP repro (plain WebSocket, no
client library) shows `Target.closeTarget` → `success:true` with no `Target.targetDestroyed`
ever emitted and the target still listed in `Target.getTargets`, ~3/10 rounds. A Chromium bug is
being filed in parallel (link when available). Playwright still has its own half: `page.close()`
trusts the acknowledgment indefinitely — a deadline/retry (or routing default close through the
`runBeforeUnload` path, which is immune) would make clients robust to the browser defect.

## Matrix (10 rounds per cell, same repro)

| | `close()` | `close({runBeforeUnload:true})` | `context.close()` |
| --- | --- | --- | --- |
| Chromium | **8/10 hang** | 0/10 | 0/10 |
| Firefox | 0/10 | 0/10 | 0/10 |
| WebKit | 0/10 | 0/10 | 0/10 |

After a hang, `context.close()` still settles and destroys the page (**8/8 recoveries**) — the
context teardown path is unaffected.

## Expected behavior

`page.close()` always settles — resolves once the page is gone, or rejects.

**Workarounds** (verified): `page.close({runBeforeUnload: true})`; or race `close()` against a
deadline and call `context.close()` on expiry (recovers reliably). Without a guard, a wedged
browser's subsequent `newPage` can then fail with `Protocol error (Target.createTarget): Not
supported` followed by "Target page, context or browser has been closed".

Possibly related: #33806 (hangs while waiting for pending navigations) — different in that no
dialog is involved and the acknowledged-but-not-performed `Target.closeTarget` is visible in the
protocol trace.
