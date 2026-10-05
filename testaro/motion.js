"use strict";
/*
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.
  Licensed under the MIT License. See LICENSE for details.
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.reporter = void 0;
const config_1 = require("../procs/config");
const launch_1 = require("../procs/launch");
const xPath_1 = require("../procs/xPath");
const xPathScript_1 = require("../procs/xPathScript");
// pixelmatch and pngjs ship no bundled declarations, so their imports stay requires, untyped.
const pixelmatch = require('pixelmatch').default;
const { PNG } = require('pngjs');
/*
  motion
  This test reports motion in a page by making three images of it during one visit and comparing them.

  For minimal accessibility, standards require motion to be brief, or else stoppable by the user. But stopping motion can be difficult or impossible, and, by the time a user manages to stop motion, the motion may have caused annoyance or harm. For superior accessibility, a page contains no motion until and unless the user authorizes it.

  The rule is concurrent (see allRules in tests/testaro.ts): it runs while the serial rules run, on a page of its own. That page has a tall viewport (a multiple of the device viewport height, capped so the image stays within browser limits), so that motion below the fold, including motion that a page starts only when it becomes visible, is in view. After the page loads, the rule waits for a grace period, makes the first image, and makes two more images after two unequal, non-integer intervals, so that periodic motion is unlikely to coincide with both intervals and look still. Any change after the grace period is motion as a user sees it, including content that arrives late. A change between the second and third images is continuing motion; a change only between the first and second is a one-time change after loading. The larger the changed area, measured as a fraction of one device screen (and so possibly exceeding 1), the greater the ordinal severity, and continuing motion is one level more severe. A changed area smaller than a minimum is disregarded as noise.

  Motion may be invisible to the images, because a player refuses to play in an automated browser (for example a video service that blocks bots) or cannot decode the media in the browser type tested. So, after the third image, the rule also reports each rendered element that the page instructs to play automatically: a video element with an autoplay attribute or property (or playing although started by a script), an embedded YouTube, Vimeo, Wistia, or Dailymotion player whose URL requests autoplay, and a Lottie player with an autoplay attribute. The instruction suffices for a violation, whether or not the motion appears in the images. An iframe that merely permits autoplay (allow="autoplay") is not reported. The severity depends on the element's area, as for observed changes, and is one level higher, because playing media is continuing motion.

  The grace period begins when the page fires its load event (or, at a later checkpoint, when the acts of the checkpoint have been replayed). The act may override the grace period and the intervals, in milliseconds, with args: {motion: [graceMs, firstIntervalMs, secondIntervalMs]}. None is scaled by TIMEOUT_MULTIPLIER, because they define motion rather than limit time.

  Compiled to motion.js by tsc (issue #73); edit this file, not the emitted one.
*/
// CONSTANTS
// Default time in milliseconds after loading before the first image.
const defaultGraceMs = 1500;
// Default times in milliseconds between the first and second and between the second and third images, unequal and non-integer in seconds so periodic motion is unlikely to coincide with both.
const defaultFirstIntervalMs = 5300;
const defaultSecondIntervalMs = 3800;
// Multiple of the device viewport height that is the height of the tall viewport.
const viewportMultiple = 8;
// Maximum height of the tall viewport in device pixels, below the browser capture limit.
const maxDeviceHeight = 16000;
// Time in milliseconds to wait for the load event if the launch returned before it.
const loadWaitMs = 10000;
// Minimum changed area, as a fraction of a screen, deemed motion rather than noise (0.01%, about 200 pixels of a 1920 × 1080 screen).
const minChange = 0.0001;
// FUNCTIONS
// Waits for a time, ending early with an error if the signal aborts.
const sleep = (ms, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
        reject(new Error('Aborted'));
        return;
    }
    let timer;
    // On abortion, stop waiting.
    const onAbort = () => {
        clearTimeout(timer);
        reject(new Error('Aborted'));
    };
    timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
});
// Returns the count of pixels that differ between two PNG images, decoding them only here so the decoded images can be collected as soon as this returns.
const getChangeCount = (pngA, pngB) => {
    const imageA = PNG.sync.read(pngA);
    const imageB = PNG.sync.read(pngB);
    // If the dimensions differ, all pixels are deemed changed.
    if (imageA.width !== imageB.width || imageA.height !== imageB.height) {
        return imageB.width * imageB.height;
    }
    return pixelmatch(imageA.data, imageB.data, null, imageA.width, imageA.height, { threshold: 0.1 });
};
// Returns an ordinal severity from a changed area as a fraction of a screen.
const getSeverity = (fraction) => fraction < 0.001 ? 0 : fraction < 0.01 ? 1 : fraction < 0.1 ? 2 : 3;
// Returns a description of a changed area as a percentage of a screen.
const describeArea = (fraction) => fraction >= 1
    ? 'at least a full screen'
    : `equal to ${Number((100 * fraction).toPrecision(2))}% of a screen`;
// Returns the rendered elements of a page that the page instructs to play automatically.
const getAutoplayers = (page) => page.evaluate(() => {
    const players = [];
    // Adds an element to the players if it is rendered with a nonzero area.
    const addIfRendered = (element, kind, muted) => {
        const box = element.getBoundingClientRect();
        const isVisible = typeof element.checkVisibility === 'function'
            ? element.checkVisibility({ visibilityProperty: true, opacityProperty: true })
            : true;
        const area = isVisible ? box.width * box.height : 0;
        if (area) {
            players.push({ xPath: window.getXPath(element) ?? '/html', kind, muted, area });
        }
    };
    // For each video element with a source:
    document.querySelectorAll('video').forEach(video => {
        if (video.currentSrc || video.getAttribute('src') || video.querySelector('source[src]')) {
            // If it is to play automatically, or a script has started it:
            const isPlaying = !video.paused && video.currentTime > 0;
            if (video.autoplay || isPlaying) {
                const kind = video.autoplay ? 'video with autoplay' : 'video started by a script';
                addIfRendered(video, kind, video.muted);
            }
        }
    });
    // Returns whether a URL parameter is true.
    const isOn = (params, name) => ['1', 'true'].includes(params.get(name) ?? '');
    // Embedded players, with the URL conditions requesting autoplay and muting.
    const embedSpecs = [
        {
            name: 'YouTube player',
            host: /(^|\.)youtube(-nocookie)?\.com$/,
            path: /^\/embed\//,
            autoplays: params => isOn(params, 'autoplay'),
            mutes: params => isOn(params, 'mute')
        },
        {
            name: 'Vimeo player',
            host: /^player\.vimeo\.com$/,
            path: /^\/video\//,
            autoplays: params => isOn(params, 'autoplay') || isOn(params, 'background'),
            mutes: params => isOn(params, 'muted') || isOn(params, 'background')
        },
        {
            name: 'Wistia player',
            host: /(^|\.)wistia\.(net|com)$/,
            path: /\/embed\//,
            autoplays: params => isOn(params, 'autoPlay'),
            mutes: params => isOn(params, 'muted')
        },
        {
            name: 'Dailymotion player',
            host: /(^|\.)dailymotion\.com$/,
            path: /\/embed\//,
            autoplays: params => isOn(params, 'autoplay'),
            mutes: params => isOn(params, 'mute')
        }
    ];
    // For each iframe:
    document.querySelectorAll('iframe').forEach(iframe => {
        try {
            const url = new URL(iframe.src);
            const spec = embedSpecs.find(spec => spec.host.test(url.hostname) && spec.path.test(url.pathname));
            // If it embeds a known player whose URL requests autoplay:
            if (spec && spec.autoplays(url.searchParams)) {
                addIfRendered(iframe, `${spec.name} with autoplay`, spec.mutes(url.searchParams));
            }
        }
        catch { }
    });
    // For each Lottie player with an autoplay attribute:
    document.querySelectorAll('lottie-player[autoplay], dotlottie-player[autoplay], dotlottie-wc[autoplay]').forEach(player => {
        addIfRendered(player, 'Lottie animation with autoplay', null);
    });
    return players;
});
// Returns the time in milliseconds since the anchor of the grace period, i.e. the load event or the launch, waiting for the load event if necessary.
const getSinceAnchor = async (page, report, launchedAt) => {
    // At a later checkpoint, the anchor is the end of the replay, i.e. the launch.
    if (report.activeCheckpoint) {
        return { sinceAnchor: Date.now() - launchedAt, loadMs: null };
    }
    // Gets the end of the load event and the current time in the page.
    const getTimes = () => page.evaluate(() => {
        const navEntry = performance.getEntriesByType('navigation')[0];
        return { loadEnd: navEntry?.loadEventEnd ?? 0, now: performance.now() };
    });
    let times = await getTimes();
    // If the page has not finished loading:
    if (!times.loadEnd) {
        // Wait for it to finish loading, within a limit.
        await page.waitForLoadState('load', { timeout: (0, config_1.applyMultiplier)(loadWaitMs) }).catch(() => { });
        times = await getTimes();
    }
    // If it has finished loading, the anchor is the end of loading.
    if (times.loadEnd) {
        return { sinceAnchor: times.now - times.loadEnd, loadMs: Math.round(times.loadEnd) };
    }
    // Otherwise, the anchor is the launch.
    return { sinceAnchor: Date.now() - launchedAt, loadMs: null };
};
// Runs the test and returns the result.
const reporter = async (_page, report, actIndex, _withItems, signal, graceMs = defaultGraceMs, firstIntervalMs = defaultFirstIntervalMs, secondIntervalMs = defaultSecondIntervalMs) => {
    // Initialize the data, totals, and standard instances.
    const data = {
        graceMs, intervalsMs: [firstIntervalMs, secondIntervalMs], prescanScroll: (0, config_1.getScroll)(report)
    };
    const totals = [0, 0, 0, 0];
    const standardInstances = [];
    // Get the dimensions of the tall viewport from those of the device.
    const windowOptions = (report.device?.windowOptions ?? {});
    const deviceViewport = windowOptions.viewport ?? { width: 1920, height: 1080 };
    const scaleFactor = windowOptions.deviceScaleFactor ?? 1;
    const viewport = {
        width: deviceViewport.width,
        height: Math.min(viewportMultiple * deviceViewport.height, Math.floor(maxDeviceHeight / scaleFactor))
    };
    data.viewport = viewport;
    // The area of one screen of the device, the unit of changed areas.
    const screenArea = deviceViewport.width * deviceViewport.height;
    const act = report.acts[actIndex];
    // Get the target URL and browser type the way the serial rules get them (tests/testaro.ts).
    const url = (act.target || report.target)?.url;
    const browserID = act.launch?.browserID || report.browserID;
    let page = null;
    // On abortion (i.e. a timeout), close the page, ending any pending operation on it.
    const onAbort = () => {
        (0, launch_1.browserClose)(page);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
        // Launch a browser with the tall viewport and visit the page, without the XPath script, which the test does not need. At a later checkpoint, use the script, so the wait suits the replay.
        const launchedPage = await (0, launch_1.launch)({
            report,
            actIndex,
            tempBrowserID: browserID,
            tempURL: url,
            xPathNeed: report.activeCheckpoint ? 'script' : 'none',
            contextOverrides: { viewport },
            retries: Number.isInteger(act.retries) && act.retries >= 0
                ? act.retries
                : config_1.ruleLaunchRetries
        });
        const launchedAt = Date.now();
        page = launchedPage;
        // If the rule timed out during the launch, stop (the page is closed below).
        if (signal?.aborted) {
            throw new Error('Aborted');
        }
        // If the launch failed:
        if (!page) {
            // Report this.
            data.prevented = true;
            data.error = 'Launch failed';
        }
        // Otherwise, if it succeeded:
        else {
            const { sinceAnchor, loadMs } = await getSinceAnchor(page, report, launchedAt);
            data.loadMs = loadMs;
            // Wait for the rest of the grace period.
            await sleep(Math.max(0, graceMs - sinceAnchor), signal);
            const firstShotAt = Date.now();
            const shotTimes = [];
            const changes = [];
            let priorPNG = null;
            const intervals = [firstIntervalMs, secondIntervalMs];
            // For each image:
            for (let shotIndex = 0; shotIndex <= intervals.length; shotIndex++) {
                // If it is not the first, wait for the interval before it.
                if (shotIndex) {
                    await sleep(intervals[shotIndex - 1], signal);
                }
                // Make it.
                const png = await page.screenshot({
                    fullPage: false,
                    scale: 'css',
                    type: 'png',
                    timeout: (0, config_1.applyMultiplier)(10000)
                });
                shotTimes.push(Math.round(Date.now() - firstShotAt + Math.max(graceMs, sinceAnchor)));
                // If it is not the first, compare it with the prior one.
                if (priorPNG) {
                    changes.push(getChangeCount(priorPNG, png) / screenArea);
                }
                // Keep only it for the next comparison.
                priorPNG = png;
            }
            priorPNG = null;
            data.shotTimes = shotTimes;
            // The changed areas between consecutive images, as fractions of a screen.
            data.changes = changes;
            // Disregard changes too small to be motion.
            const [firstChange, secondChange] = changes.map(change => change < minChange ? 0 : change);
            let violationWhat = '';
            let ordinalSeverity = 0;
            // If the page changed between the second and third images:
            if (secondChange) {
                // Describe continuing motion.
                violationWhat = `Content changes spontaneously and continually (changed area between the last 2 images ${describeArea(secondChange)})`;
                ordinalSeverity = Math.min(3, getSeverity(secondChange) + 1);
            }
            // Otherwise, if it changed only between the first and second images:
            else if (firstChange) {
                // Describe a one-time change.
                violationWhat = `Content changes spontaneously after loading (changed area ${describeArea(firstChange)})`;
                ordinalSeverity = getSeverity(firstChange);
            }
            // If there was a violation:
            if (violationWhat) {
                // Add to the totals.
                totals[ordinalSeverity]++;
                // Get a summary standard instance.
                standardInstances.push({
                    ruleID: 'motion',
                    what: violationWhat,
                    ordinalSeverity: ordinalSeverity,
                    count: 1,
                    catalogIndex: (0, xPath_1.getXPathCatalogIndex)(report, '/html/body')
                });
            }
            // Get the rendered elements that the page instructs to play automatically.
            await (0, xPathScript_1.defineGetXPath)(page);
            const autoplayers = await getAutoplayers(page);
            // For each of them:
            autoplayers.forEach(({ xPath, kind, muted, area }) => {
                const fraction = area / screenArea;
                const severity = Math.min(3, getSeverity(fraction) + 1);
                const mutedNote = muted === false ? ', not muted' : '';
                // Add to the totals.
                totals[severity]++;
                // Get a standard instance.
                standardInstances.push({
                    ruleID: 'motion',
                    what: `Element is instructed to play automatically (${kind}${mutedNote}; area ${describeArea(fraction)})`,
                    ordinalSeverity: severity,
                    count: 1,
                    catalogIndex: (0, xPath_1.getXPathCatalogIndex)(report, xPath)
                });
            });
            data.autoplayers = autoplayers.map(({ kind, muted }) => ({ kind, muted }));
        }
    }
    finally {
        signal?.removeEventListener('abort', onAbort);
        // Close the page.
        await (0, launch_1.browserClose)(page);
    }
    // Return the result.
    return {
        data,
        totals,
        standardInstances
    };
};
exports.reporter = reporter;
