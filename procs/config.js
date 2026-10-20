/*
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

/*
  config
  Shared configuration values for Testaro.
*/

// Amount to multiply by specified time limits (normally 1) to adapt to network/site speed.
const timeoutMultiplier = Number.parseFloat(process.env.TIMEOUT_MULTIPLIER) || 1;
// Multiplies a time limit by the configured amount.
exports.applyMultiplier = (baseTimeout) => Math.round(baseTimeout * timeoutMultiplier);

// Returns whether an environment variable is set to a true value, or the default if unset.
const envFlag = (name, defaultValue = false) => {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
};
exports.envFlag = envFlag;

/*
  Deployment options. Each is a job property when a job sets it, else an environment
  variable, else the historical default, so an operator can set a fleet-wide policy and a job
  can override it. See README.md (Jobs) and env.example.
*/

// Load states a navigation can wait for, from strictest to loosest.
const waitStates = exports.waitStates = ['networkidle', 'load', 'domcontentloaded'];
// Defaults for navigation: the load state to wait for (NAV_WAIT_UNTIL; networkidle, the
// historical default, never arrives on pages whose network never quiets, so a deployment may
// prefer load), the time limit in ms (NAV_TIMEOUT), and whether a 4xx response ends launch
// retries at once (NAV_FAIL_FAST_4XX; a client error is a definitive refusal that retrying
// and switching browsers cannot change).
const navTimeout = Number.parseInt(process.env.NAV_TIMEOUT);
const navigationDefaults = {
  waitUntil: waitStates.includes(process.env.NAV_WAIT_UNTIL) ? process.env.NAV_WAIT_UNTIL : 'networkidle',
  timeout: navTimeout > 0 ? navTimeout : 10000,
  failFast4xx: envFlag('NAV_FAIL_FAST_4XX')
};
// Returns the navigation options of a job: its navigation property over the defaults.
exports.getNavigation = report => {
  const own = report && report.navigation && typeof report.navigation === 'object'
    ? report.navigation
    : {};
  return {
    waitUntil: waitStates.includes(own.waitUntil) ? own.waitUntil : navigationDefaults.waitUntil,
    timeout: Number.isInteger(own.timeout) && own.timeout > 0 ? own.timeout : navigationDefaults.timeout,
    failFast4xx: typeof own.failFast4xx === 'boolean' ? own.failFast4xx : navigationDefaults.failFast4xx
  };
};
// The scanner identity sent as the X-YRA-Scanner request header, so that web application
// firewalls can recognize the scanner by a stable value (unlike the emulated User-Agent):
// the job's scannerId, else SCANNER_ID, else none.
exports.getScannerId = report => (report && report.scannerId) || process.env.SCANNER_ID || '';
// Whether to scroll the full height of a page after navigation, before cataloguing, imaging,
// and each tool, so that lazily loaded content is present: the job's scroll property, else
// PRESCAN_SCROLL, else false (the as-loaded page, comparable with the WebAIM Million).
exports.getScroll = report => (
  report && typeof report.scroll === 'boolean' ? report.scroll : envFlag('PRESCAN_SCROLL')
);
// Launch retries per rule of the testaro tool, which relaunches the browser per contaminating
// rule: TESTARO_RULE_RETRIES, else 2. Non-Chromium browsers navigate flakily on relaunch, so
// a deployment testing them may raise this.
const ruleRetries = Number.parseInt(process.env.TESTARO_RULE_RETRIES);
exports.ruleLaunchRetries = ruleRetries >= 0 ? ruleRetries : 2;
// Defaults for the qualWeb tool's browser: stealth evasions (QUALWEB_STEALTH) and ad and
// tracker blocking (QUALWEB_ADBLOCK), both on by default as the tool was designed.
exports.qualWebDefaults = {
  stealth: envFlag('QUALWEB_STEALTH', true),
  adBlock: envFlag('QUALWEB_ADBLOCK', true)
};
// Returns the launch options that route a browser of the specified type through the outbound
// proxy (TESTARO_PROXY: an http, https, or socks5 URL, with any credentials), so that tested
// sites see the proxy's address rather than the host's; or {} if none is configured. Applies
// to every browser Testaro launches, including the qualWeb tool's. A malformed value throws
// instead of falling back to a direct connection that would expose the host's address. The
// browser's WebRTC traffic is confined to the proxy where the browser permits (Chromium and
// Firefox; WebKit has no such launch option), since WebRTC UDP bypasses an HTTP proxy.
exports.getProxyLaunchOptions = browserID => {
  const value = (process.env.TESTARO_PROXY || '').trim();
  if (! value) {
    return {};
  }
  let url;
  try {
    url = new URL(value);
  }
  // The value is not quoted in errors, because it may contain credentials.
  catch {
    throw new Error('TESTARO_PROXY is not a URL');
  }
  if (! ['http:', 'https:', 'socks5:'].includes(url.protocol) || ! url.hostname) {
    throw new Error('TESTARO_PROXY is not an http, https, or socks5 URL with a host');
  }
  const proxy = {server: `${url.protocol}//${url.host}`};
  if (url.username) {
    proxy.username = decodeURIComponent(url.username);
    proxy.password = decodeURIComponent(url.password);
  }
  if (browserID === 'chromium') {
    return {proxy, args: ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp']};
  }
  if (browserID === 'firefox') {
    return {proxy, firefoxUserPrefs: {'media.peerconnection.ice.proxy_only': true}};
  }
  return {proxy};
};
