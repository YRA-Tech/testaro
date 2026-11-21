"use strict";
/*
  © 2021–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.reporter = void 0;
// IMPORTS
const promises_1 = require("fs/promises");
const url_1 = require("url");
const playwright_1 = require("playwright");
const xPath_1 = require("../procs/xPath");
const standard_1 = require("../procs/standard");
const config_1 = require("../procs/config");
/*
  The alfa packages are pure ESM that Node loads via require(esm); their own
  types do not resolve under this project's node10 module resolution, so the
  imports stay requires and are untyped.
*/
let alfaRules = require('@siteimprove/alfa-rules').default;
const { Audit } = require('@siteimprove/alfa-act');
const { Playwright } = require('@siteimprove/alfa-playwright');
// Reasons for style losses that do not prevent the act.
const tolerableReasons = new Set(['unsupported', 'late']);
/*
  alfa
  Implements the alfa ruleset for accessibility.
  Compiled to alfa.js by tsc (issue #73); edit this file, not the emitted one.
*/
// FUNCTIONS
/*
  A material rule is one that can affect how a page is presented on screen. Font-face rules (which only make fonts available) and page rules (which apply only to printing) are not material, and neither are the rules nested in page rules.
*/
// Counts the material rules in an alfa serialization of rules.
const countAlfaRules = (rules) => rules.reduce((count, rule) => ['font-face', 'page'].includes(rule.type)
    ? count
    : count + 1 + countAlfaRules(rule.rules ?? []), 0);
/*
  Removes CSS comments without changing comment-like text inside strings. Each comment is replaced with a space or, if keepLength is true, with as many spaces as it has characters, so that positions in the result are positions in the text.
*/
const stripCSSComments = (text, keepLength = false) => {
    let result = '';
    let quote = '';
    for (let index = 0; index < text.length; index++) {
        const char = text[index];
        if (quote) {
            result += char;
            if (char === '\\') {
                result += text[++index] ?? '';
            }
            else if (char === quote) {
                quote = '';
            }
        }
        else if (char === '"' || char === '\'') {
            quote = char;
            result += char;
        }
        else if (char === '/' && text[index + 1] === '*') {
            const end = text.indexOf('*/', index + 2);
            const commentEnd = end === -1 ? text.length : end + 2;
            result += keepLength ? ' '.repeat(commentEnd - index) : ' ';
            if (end === -1) {
                break;
            }
            index = end + 1;
        }
        else {
            result += char;
        }
    }
    return result;
};
/*
  Records in the page the lists of its document and adopted stylesheets, so that copy
  planning, alfa’s view of the sheets, and loss checking all use the same lists. A page can
  add, remove, and reorder its sheets while it is tested, and these steps take place at
  different times, so lists read anew at each step could differ and be misaligned.
*/
const snapshotSheets = (page) => page.evaluate(() => {
    Object.defineProperty(document, '__testaroAlfaSheets', {
        configurable: true,
        value: {
            dom: Array.from(document.styleSheets),
            adopted: Array.from(document.adoptedStyleSheets ?? [])
        }
    });
});
// Removes the recorded lists of the page’s stylesheets.
const releaseSnapshot = (page) => page.evaluate(() => {
    Reflect.deleteProperty(document, '__testaroAlfaSheets');
}).catch(() => { });
// Gets the document stylesheets of the page as page scripts see them, in alfa’s order.
const getPageSheets = (page) => page.evaluate(() => {
    // Counts the material rules in a list of rules, recording imports whose rules are unreadable.
    const countRules = (rules, unreadableImports) => {
        let count = 0;
        for (const rule of Array.from(rules)) {
            if (rule instanceof CSSFontFaceRule || rule instanceof CSSPageRule) {
                continue;
            }
            count++;
            if (rule instanceof CSSImportRule) {
                if (rule.styleSheet) {
                    try {
                        count += countRules(rule.styleSheet.cssRules, unreadableImports);
                    }
                    catch (error) {
                        unreadableImports.push(rule.styleSheet.href || rule.href);
                    }
                }
            }
            // Grouping, keyframes, and style rules can contain rules (style rules by CSS nesting).
            else if ('cssRules' in rule) {
                count += countRules(rule.cssRules, unreadableImports);
            }
        }
        return count;
    };
    // Get the recorded lists of the page’s sheets, if any, and the current lists.
    const snapshot = document.__testaroAlfaSheets;
    const liveDOM = Array.from(document.styleSheets);
    const liveAdopted = Array.from(document.adoptedStyleSheets ?? []);
    const domSheets = snapshot ? snapshot.dom : liveDOM;
    const adoptedSheets = snapshot ? snapshot.adopted : liveAdopted;
    // Alfa serializes the document sheets first and then the constructed (adopted) sheets.
    const sheets = [
        ...domSheets.map((sheet, index) => ({ sheet, kind: 'dom', index })),
        ...adoptedSheets.map((sheet, index) => ({ sheet, kind: 'adopted', index }))
    ];
    // Identify the sheets the page added after the lists were recorded, which alfa did not see.
    const lateSheets = snapshot
        ? [
            ...liveDOM.filter(sheet => !snapshot.dom.includes(sheet))
                .map(sheet => ({ sheet, kind: 'dom', index: liveDOM.indexOf(sheet) })),
            ...liveAdopted.filter(sheet => !snapshot.adopted.includes(sheet))
                .map(sheet => ({ sheet, kind: 'adopted', index: liveAdopted.indexOf(sheet) }))
        ]
        : [];
    // Identify the sheets the browser failed to load, so losses are not claimed where the page itself lacks the rules.
    const failedLoads = new Set(performance.getEntriesByType('resource')
        .filter(entry => (entry.responseStatus ?? 0) >= 400)
        .map(entry => entry.name));
    // Describes a sheet as page scripts see it.
    const describe = ({ sheet, kind, index }) => {
        const unreadableImports = [];
        // A document sheet that the page has removed since the lists were recorded has no owner node.
        const sheetName = sheet.href
            || (kind === 'dom' ? `inline sheet ${index}` : `constructed sheet ${index}`);
        const isCrossOrigin = !!sheet.href && new URL(sheet.href).origin !== location.origin;
        let ruleCount = null;
        try {
            ruleCount = countRules(sheet.cssRules, unreadableImports);
        }
        catch (error) { }
        return {
            sheet: sheetName,
            isCrossOrigin,
            ruleCount,
            unreadableImports,
            loadFailed: !!sheet.href && failedLoads.has(sheet.href),
            corsRequested: sheet.ownerNode instanceof HTMLLinkElement
                && sheet.ownerNode.hasAttribute('crossorigin'),
            kind,
            index
        };
    };
    return {
        sheets: sheets.map(describe),
        late: lateSheets.map(describe)
    };
});
// Returns the hrefs of the @import rules of a stylesheet text.
const getImportHrefs = (text) => {
    // Erase comments, which can contain import-like text.
    let rest = stripCSSComments(text).trimStart();
    const hrefs = [];
    /*
      An import rule is valid only before all other rules except charset rules and layer
      statements. Scan the leading statements and stop at the first other rule; browsers ignore
      any later import rules.
    */
    const importRE = /^@import\s+(?:url\(\s*["']?([^"')]+?)["']?\s*\)|["']([^"']+)["'])[^;]*(?:;|$)/i;
    const preludeRE = /^@(?:charset\s+["'][^"']+["']|layer\s+[^;{]+);/i;
    while (rest.length) {
        const importMatch = rest.match(importRE);
        if (importMatch) {
            hrefs.push((importMatch[1] ?? importMatch[2]).trim());
            rest = rest.slice(importMatch[0].length).trimStart();
            continue;
        }
        const preludeMatch = rest.match(preludeRE);
        if (preludeMatch) {
            rest = rest.slice(preludeMatch[0].length).trimStart();
            continue;
        }
        break;
    }
    return hrefs;
};
// Returns the scheme family of a URL: file, http (including https), data, or other.
const getSchemeFamily = (url) => {
    if (url.startsWith('file:')) {
        return 'file';
    }
    if (/^https?:/.test(url)) {
        return 'http';
    }
    return url.startsWith('data:') ? 'data' : 'other';
};
/*
  Returns the Referer header that a browser would by default (under the policy
  strict-origin-when-cross-origin) send when a document or stylesheet requests an HTTP
  resource, or null if it would send none. Some servers, such as those of licensed font
  services, do not respond to a stylesheet request that lacks the Referer of a licensed site.
*/
const getReferer = (referrer, url) => {
    try {
        const from = new URL(referrer);
        const to = new URL(url);
        // If the requester is not an HTTP resource or the request would downgrade security:
        if (!['http:', 'https:'].includes(from.protocol)
            || (from.protocol === 'https:' && to.protocol !== 'https:')) {
            // No Referer would be sent.
            return null;
        }
        // If the request is same-origin, the Referer is the URL without credentials or fragment.
        if (from.origin === to.origin) {
            from.username = '';
            from.password = '';
            from.hash = '';
            return from.href;
        }
        // Otherwise the Referer is only the origin.
        return `${from.origin}/`;
    }
    catch (error) {
        return null;
    }
};
/*
  Gets the text of a stylesheet that page scripts cannot read, or null if it is unavailable.
  The referrer is the URL of the page or stylesheet that requests the sheet.
*/
const getSheetText = async (fetcher, url, referrer) => {
    try {
        const family = getSchemeFamily(url);
        // If the sheet is a local file (each file URL being an origin of its own):
        if (family === 'file') {
            // Read it.
            return await (0, promises_1.readFile)((0, url_1.fileURLToPath)(url), 'utf8');
        }
        // Otherwise, if the sheet is a data URL:
        if (family === 'data') {
            // Decode it.
            const commaIndex = url.indexOf(',');
            if (commaIndex === -1) {
                return null;
            }
            const payload = url.slice(commaIndex + 1);
            return url.slice(5, commaIndex).endsWith(';base64')
                ? Buffer.from(payload, 'base64').toString('utf8')
                : decodeURIComponent(payload);
        }
        // Otherwise, if it is an HTTP resource:
        if (family === 'http') {
            // Fetch it outside the page, where the cross-origin rule does not apply, as a browser would.
            const referer = getReferer(referrer, url);
            const response = await fetcher.get(url, {
                timeout: (0, config_1.applyMultiplier)(5000),
                ...(referer ? { headers: { Referer: referer } } : {})
            });
            return response.ok() ? await response.text() : null;
        }
        return null;
    }
    catch (error) {
        return null;
    }
};
/*
  Counts the material rules in the text of a stylesheet that page scripts cannot read, plus
  those of the stylesheets it validly imports, fetched relative to its URL. Each import rule
  counts as 1, as it does for page scripts. An import is followed only if its URL is a data URL
  or has the scheme family (file or http) of the sheet at the root of the import chain, as a
  browser would not let a web page import a local file; otherwise only its rule is counted.
  Returns null if the rules of any followed import cannot be counted.
*/
const countTextRules = async (page, fetcher, text, url, visited = []) => {
    try {
        // Count the sheet’s own material rules in a sheet constructed by the page, whose rules are readable.
        const ownCount = await page.evaluate(text => {
            const countRules = (rules) => {
                let count = 0;
                for (const rule of Array.from(rules)) {
                    if (rule instanceof CSSFontFaceRule || rule instanceof CSSPageRule) {
                        continue;
                    }
                    count++;
                    if ('cssRules' in rule) {
                        count += countRules(rule.cssRules);
                    }
                }
                return count;
            };
            const sheet = new CSSStyleSheet();
            // This ignores any @import rules in the text; they are counted below instead.
            sheet.replaceSync(text);
            return countRules(sheet.cssRules);
        }, text);
        // Add the import rules themselves and the material rules of the sheets they import.
        const importHrefs = getImportHrefs(text);
        let count = ownCount + importHrefs.length;
        // Guard against circular imports.
        const visitedNext = [...visited, url];
        const rootFamily = getSchemeFamily(visitedNext[0]);
        for (const href of importHrefs) {
            let importURL;
            try {
                importURL = new URL(href, url).href;
            }
            catch (error) {
                continue;
            }
            const importFamily = getSchemeFamily(importURL);
            const isFollowable = importFamily === 'data' || importFamily === rootFamily;
            if (isFollowable && !visitedNext.includes(importURL)) {
                const importText = await getSheetText(fetcher, importURL, url);
                const importCount = importText === null
                    ? null
                    : await countTextRules(page, fetcher, importText, importURL, visitedNext);
                // If the rules of the imported sheet cannot be counted, neither can those of this sheet.
                if (importCount === null) {
                    return null;
                }
                count += importCount;
            }
        }
        return count;
    }
    catch (error) {
        return null;
    }
};
/*
  Constructor names of the CSS rule types that alfa can serialize, as implemented by the
  rule serializer of alfa-dom. A rule of any other type makes serialization of its
  stylesheet fail (at sheet top level or within a layer block) or empties its media or
  supports block, while rules nested in style rules are silently omitted.
*/
const ALFA_RULE_TYPES = new Set([
    'CSSFontFaceRule',
    'CSSImportRule',
    'CSSKeyframeRule',
    'CSSKeyframesRule',
    'CSSLayerBlockRule',
    'CSSLayerStatementRule',
    'CSSMediaRule',
    'CSSNamespaceRule',
    'CSSPageRule',
    'CSSStyleRule',
    'CSSSupportsRule'
]);
// Returns a copy of the plans for copies of the stylesheets that deny rules to alfa.
const getCopyPlans = (page) => page.evaluate(alfaTypes => {
    const supported = new Set(alfaTypes);
    // Returns the name of the constructor of a rule, as alfa’s serializer recognizes it.
    const tag = (rule) => rule.constructor?.name
        || Object.prototype.toString.call(rule).replace(/^\[object (.+)\]$/, '$1');
    /*
      Returns whether a list of rules contains anything alfa cannot fully serialize: a rule of
      a type its serializer does not support, a rule nested in a style rule (CSS nesting), or
      an import whose rules page scripts cannot read.
    */
    const deniesRules = (rules) => {
        for (const rule of Array.from(rules)) {
            if (!supported.has(tag(rule))) {
                return true;
            }
            if (rule instanceof CSSImportRule && rule.styleSheet) {
                try {
                    /*
                      Access throws for a cross-origin import not requested with CORS, and a
                      readable imported sheet can itself contain rules alfa cannot serialize.
                    */
                    if (deniesRules(rule.styleSheet.cssRules)) {
                        return true;
                    }
                }
                catch (error) {
                    return true;
                }
            }
            // Alfa does not serialize rules nested in style rules (CSS nesting).
            if (rule instanceof CSSStyleRule && rule.cssRules.length) {
                return true;
            }
            if ('cssRules' in rule && !(rule instanceof CSSStyleRule) && deniesRules(rule.cssRules)) {
                return true;
            }
        }
        return false;
    };
    // Use the recorded lists of the page’s sheets, if any.
    const snapshot = document.__testaroAlfaSheets;
    const domSheets = snapshot ? snapshot.dom : Array.from(document.styleSheets);
    const adoptedSheets = snapshot ? snapshot.adopted : Array.from(document.adoptedStyleSheets ?? []);
    const plans = [];
    // Alfa serializes the document sheets first and then the adopted sheets.
    domSheets.forEach((sheet, index) => {
        let readable = true;
        let unserializable = false;
        try {
            unserializable = deniesRules(sheet.cssRules);
        }
        catch (error) {
            readable = false;
        }
        /*
          The page lacks the rules of a CORS-requested sheet that page scripts cannot read:
          its load failed, since a successful CORS response would have made it readable.
        */
        const loadFailed = !readable
            && sheet.ownerNode instanceof HTMLLinkElement
            && sheet.ownerNode.hasAttribute('crossorigin');
        // If the page has the sheet but it denies rules to alfa:
        if (!loadFailed && (!readable || unserializable)) {
            plans.push({
                copyOf: sheet.href || `inline sheet ${index}`,
                kind: 'dom',
                index,
                href: sheet.href,
                text: readable
                    ? Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n')
                    : null,
                media: sheet.media.mediaText,
                disabled: sheet.disabled
            });
        }
    });
    adoptedSheets.forEach((sheet, index) => {
        let unserializable = false;
        try {
            unserializable = deniesRules(sheet.cssRules);
        }
        catch (error) { }
        // If the sheet denies rules to alfa:
        if (unserializable) {
            plans.push({
                copyOf: `constructed sheet ${index}`,
                kind: 'adopted',
                index,
                href: sheet.href,
                text: Array.from(sheet.cssRules).map(rule => rule.cssText).join('\n'),
                media: sheet.media.mediaText,
                disabled: sheet.disabled
            });
        }
    });
    return plans;
}, Array.from(ALFA_RULE_TYPES));
// Wraps the text of an imported stylesheet in the conditions of its import rule.
const wrapImport = (text, tail) => {
    let rest = tail.trim();
    // Extract the optional layer clause, whether named or anonymous.
    let layer = null;
    const layerMatch = rest.match(/layer\(([^)]*)\)|\blayer\b/i);
    if (layerMatch) {
        layer = layerMatch[1]?.trim() ?? '';
        rest = `${rest.slice(0, layerMatch.index)}${rest.slice((layerMatch.index ?? 0) + layerMatch[0].length)}`.trim();
    }
    // Extract the optional supports clause, balancing its parentheses.
    let supports = null;
    const supportsMatch = rest.match(/supports\(/i);
    if (supportsMatch) {
        const start = (supportsMatch.index ?? 0) + supportsMatch[0].length;
        let depth = 1;
        let end = start;
        while (end < rest.length && depth) {
            if (rest[end] === '(') {
                depth++;
            }
            else if (rest[end] === ')') {
                depth--;
            }
            end++;
        }
        if (!depth) {
            supports = rest.slice(start, end - 1).trim();
            rest = `${rest.slice(0, supportsMatch.index)}${rest.slice(end)}`.trim();
        }
    }
    // Treat the rest of the rule as the media list.
    const media = rest;
    if (layer !== null) {
        text = `@layer${layer ? ` ${layer}` : ''} {\n${text}\n}`;
    }
    if (supports) {
        text = `@supports (${supports}) {\n${text}\n}`;
    }
    if (media) {
        text = `@media ${media} {\n${text}\n}`;
    }
    return text;
};
// Returns the index just after the end of the CSS string starting at an index of a text.
const getStringEnd = (text, start) => {
    const quote = text[start];
    let index = start + 1;
    while (index < text.length) {
        const char = text[index];
        if (char === '\\') {
            index += 2;
        }
        else if (char === quote) {
            return index + 1;
        }
        // An unescaped newline ends a string, which is then invalid.
        else if (char === '\n') {
            return index;
        }
        else {
            index++;
        }
    }
    return text.length;
};
/*
  Makes the relative URLs of the url() functions of a stylesheet text absolute, leaving comments, strings, and fragment-only URLs (which refer to the document) unchanged.
*/
const absolutizeURLs = (text, baseURL) => {
    let result = '';
    let index = 0;
    while (index < text.length) {
        const char = text[index];
        // If a comment starts here, copy it.
        if (char === '/' && text[index + 1] === '*') {
            const end = text.indexOf('*/', index + 2);
            const stop = end === -1 ? text.length : end + 2;
            result += text.slice(index, stop);
            index = stop;
        }
        // Otherwise, if a string starts here, copy it.
        else if (char === '"' || char === '\'') {
            const stop = getStringEnd(text, index);
            result += text.slice(index, stop);
            index = stop;
        }
        // Otherwise, if an escape starts here, copy it.
        else if (char === '\\') {
            result += text.slice(index, index + 2);
            index += 2;
        }
        // Otherwise, if a url() function that is not part of a longer name starts here:
        else if (text.slice(index, index + 4).toLowerCase() === 'url(' && !/[-\w\\]/.test(text[index - 1] ?? '')) {
            // Get its URL.
            let cursor = index + 4;
            while (/\s/.test(text[cursor] ?? '')) {
                cursor++;
            }
            let href = '';
            let argEnd = cursor;
            if (text[cursor] === '"' || text[cursor] === '\'') {
                argEnd = getStringEnd(text, cursor);
                href = text.slice(cursor + 1, argEnd - 1);
            }
            else {
                const close = text.indexOf(')', cursor);
                argEnd = close === -1 ? text.length : close;
                href = text.slice(cursor, argEnd);
            }
            let close = argEnd;
            while (/\s/.test(text[close] ?? '')) {
                close++;
            }
            href = href.trim();
            let absoluteURL = null;
            // If the function is complete and its URL is relative to the sheet, get the absolute URL.
            if (text[close] === ')' && href && !href.startsWith('#')) {
                try {
                    absoluteURL = new URL(href, baseURL).href;
                }
                catch (error) { }
            }
            // Copy the function with the absolute URL, if any, or else as it is.
            if (absoluteURL) {
                result += `url("${absoluteURL}")`;
                index = close + 1;
            }
            else {
                result += text.slice(index, index + 4);
                index += 4;
            }
        }
        // Otherwise, copy the character.
        else {
            result += char;
            index++;
        }
    }
    return result;
};
/*
  Prepares the text of a stylesheet copy for injection: inlines the texts of its valid
  imports (each wrapped in its layer, supports, and media conditions) and makes relative URLs
  absolute. Returns the resulting text and the URLs of imports whose texts could not be
  fetched.
*/
const resolveSheetText = async (fetcher, text, url, visited = []) => {
    const failedImports = [];
    /*
      Scan a copy of the text in which comments, which can contain import-like text, are blanked out, but in which positions are those of the text. Comments must remain in the text itself, because a comment can separate tokens without being whitespace: a comment between .a and .b leaves them a compound selector, but a space would make a descendant selector of them.
    */
    const scanText = stripCSSComments(text, true);
    let position = 0;
    const blocks = [];
    /*
      An import is followed only if its URL is a data URL or has the scheme family of the
      sheet at the root of the import chain, as in countTextRules: a web page cannot
      import a local file.
    */
    const rootFamily = getSchemeFamily(visited[0] ?? url);
    /*
      An import rule is valid only before all other rules except charset rules and layer
      statements. Scan the leading statements and stop at the first other rule, as in
      getImportHrefs.
    */
    const importRE = /^@import\s+(?:url\(\s*["']?([^"')]+?)["']?\s*\)|["']([^"']+)["'])\s*([^;]*)(?:;|$)/i;
    const preludeRE = /^@(charset\s+["'][^"']*["']|layer\s+[^;{]+)\s*;/i;
    while (position < scanText.length) {
        position += scanText.slice(position).length - scanText.slice(position).trimStart().length;
        const rest = scanText.slice(position);
        const importMatch = rest.match(importRE);
        if (importMatch) {
            position += importMatch[0].length;
            const href = (importMatch[1] ?? importMatch[2]).trim();
            let importURL = null;
            try {
                importURL = new URL(href, url).href;
            }
            catch (error) { }
            // If the import can be fetched and is not circular, inline it, else report it.
            if (importURL && !visited.includes(importURL)) {
                if (getSchemeFamily(importURL) === 'data'
                    || getSchemeFamily(importURL) === rootFamily) {
                    const imported = await getSheetText(fetcher, importURL, url);
                    if (imported === null) {
                        failedImports.push(importURL);
                    }
                    else {
                        const resolved = await resolveSheetText(fetcher, imported, importURL, [...visited, url]);
                        failedImports.push(...resolved.failedImports);
                        blocks.push(wrapImport(resolved.text, importMatch[3] ?? ''));
                    }
                }
                // Otherwise the browser would keep the rule but not follow it; do the same.
                else {
                    const tail = (importMatch[3] ?? '').trim();
                    blocks.push(`@import url("${importURL}")${tail ? ` ${tail}` : ''};`);
                }
            }
            else if (!importURL) {
                failedImports.push(href);
            }
            continue;
        }
        const preludeMatch = rest.match(preludeRE);
        if (preludeMatch) {
            position += preludeMatch[0].length;
            // Keep layer statements, which order layers, but drop charset declarations.
            if (preludeMatch[0].toLowerCase().startsWith('@layer')) {
                blocks.push(preludeMatch[0]);
            }
            continue;
        }
        break;
    }
    /*
      Keep the rest of the text, including any import and charset statements that follow other
      rules, which are invalid, so the browser discards them when it parses the copy.
    */
    return {
        text: `${blocks.join('\n')}\n${absolutizeURLs(text.slice(position), url)}`,
        failedImports
    };
};
/*
  Whether a stylesheet can be copied without changing layer or nested-selector semantics. A
  copy declares the named layers of its original in the same order, at the same place, so it
  leaves their order unchanged. But each anonymous layer is a distinct layer, so the copy of
  an anonymous layer would follow, and outrank, the named layers of the original that follow
  it, if alfa also serialized the original in part.
*/
const isSafeCopy = (page, text) => page.evaluate(text => {
    const tag = (rule) => rule.constructor?.name
        || Object.prototype.toString.call(rule).replace(/^\[object (.+)\]$/, '$1');
    const splitList = (selector) => {
        const parts = [];
        let depth = 0;
        let quote = '';
        let start = 0;
        for (let i = 0; i < selector.length; i++) {
            const char = selector[i];
            if (quote) {
                if (char === quote) {
                    quote = '';
                }
            }
            else if (char === '"' || char === '\'') {
                quote = char;
            }
            else if (char === '(' || char === '[') {
                depth++;
            }
            else if (char === ')' || char === ']') {
                depth--;
            }
            else if (char === ',' && !depth) {
                parts.push(selector.slice(start, i));
                start = i + 1;
            }
        }
        parts.push(selector.slice(start));
        return parts.filter(Boolean);
    };
    const hasUnsafeRules = (rules) => Array.from(rules).some(rule => {
        if (tag(rule) === 'CSSLayerBlockRule' && !rule.name) {
            return true;
        }
        if (rule instanceof CSSStyleRule && rule.cssRules.length) {
            if (splitList(rule.selectorText).length > 1 || hasUnsafeRules(rule.cssRules)) {
                return true;
            }
        }
        else if ('cssRules' in rule && hasUnsafeRules(rule.cssRules)) {
            return true;
        }
        return false;
    });
    try {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(text);
        return !hasUnsafeRules(sheet.cssRules);
    }
    catch (error) {
        return false;
    }
}, text);
/*
  Creates detached stylesheet copies and exposes them to alfa in temporary stylesheet-list
  views made of the recorded lists of the page’s sheets, each copy right after its original.
  This preserves sheet order without changing the page’s DOM or applying duplicate rules. The
  views are exposed even if there are no copies, so alfa sees the recorded lists.
*/
const injectCopies = (page, plans) => page.evaluate((args) => {
    const { specs, alfaTypes } = args;
    const supported = new Set(alfaTypes);
    // Returns the name of the constructor of a rule, as alfa’s serializer recognizes it.
    const tag = (rule) => rule.constructor?.name
        || Object.prototype.toString.call(rule).replace(/^\[object (.+)\]$/, '$1');
    // Counts the material rules of a rule list as alfa counts them: grouping rules and their contents count, but rules nested in style rules do not.
    const alfaView = (rules) => {
        let count = 0;
        for (const rule of Array.from(rules)) {
            if (rule instanceof CSSFontFaceRule || rule instanceof CSSPageRule) {
                continue;
            }
            count++;
            if ('cssRules' in rule && !(rule instanceof CSSStyleRule)) {
                count += alfaView(rule.cssRules);
            }
        }
        return count;
    };
    const countMaterialRules = (rule) => {
        if (rule instanceof CSSFontFaceRule || rule instanceof CSSPageRule) {
            return 0;
        }
        return 1 + ('cssRules' in rule
            ? Array.from(rule.cssRules)
                .reduce((count, child) => count + countMaterialRules(child), 0)
            : 0);
    };
    // Splits a selector list on commas not enclosed in parentheses, brackets, or quotes.
    const splitList = (selector) => {
        const parts = [];
        let depth = 0;
        let quote = '';
        let start = 0;
        for (let i = 0; i < selector.length; i++) {
            const char = selector[i];
            if (quote) {
                if (char === quote) {
                    quote = '';
                }
            }
            else if (char === '"' || char === '\'') {
                quote = char;
            }
            else if (char === '(' || char === '[') {
                depth++;
            }
            else if (char === ')' || char === ']') {
                depth--;
            }
            else if (char === ',' && !depth) {
                parts.push(selector.slice(start, i));
                start = i + 1;
            }
        }
        parts.push(selector.slice(start));
        return parts.map(part => part.trim()).filter(Boolean);
    };
    // Replaces each nesting selector (&) of a selector outside strings, or returns null if there is none.
    const replaceNesting = (selector, replacement) => {
        let result = '';
        let found = false;
        let quote = '';
        for (let i = 0; i < selector.length; i++) {
            const char = selector[i];
            if (char === '\\') {
                result += selector.slice(i, i + 2);
                i++;
            }
            else if (quote) {
                result += char;
                if (char === quote) {
                    quote = '';
                }
            }
            else if (char === '"' || char === '\'') {
                quote = char;
                result += char;
            }
            else if (char === '&') {
                result += replacement;
                found = true;
            }
            else {
                result += char;
            }
        }
        return found ? result : null;
    };
    /*
      Expands each nested selector against each parent selector. A nesting selector (&) means :is() of the parent selector, which is equivalent to the parent selector only if that is a compound selector. So each nesting selector is replaced with :is() of the parent selector, which has the parent selector’s specificity when that is a single selector, as for any sheet that is copied. A nested selector without a nesting selector is relative to the parent selector as a descendant (or with a combinator it begins with), so it is appended to the parent selector.
    */
    const combine = (parents, nested) => parents.flatMap(parent => nested.map(selector => replaceNesting(selector, `:is(${parent})`) ?? `${parent} ${selector}`));
    /*
      Appends to out the text of a rule nested in a style rule, made equivalent to top-level
      rules by expanding its selectors against those of its ancestors. Grouping rules keep
      their headers; their contents are flattened recursively.
    */
    const flattenRule = (rule, parents, out, omitted, omittedRuleCount) => {
        if (rule instanceof CSSStyleRule) {
            const selectors = combine(parents, splitList(rule.selectorText));
            out.push(`${selectors.join(', ')} { ${rule.style.cssText} }`);
            for (const child of Array.from(rule.cssRules)) {
                flattenRule(child, selectors, out, omitted, omittedRuleCount);
            }
        }
        // A rule bearing declarations but no selector is a nested-declarations rule.
        else if ('style' in rule) {
            out.push(`${parents.join(', ')} { ${rule.style.cssText} }`);
        }
        else if ('cssRules' in rule) {
            if (!supported.has(tag(rule))) {
                omitted.add(tag(rule));
                omittedRuleCount.value += countMaterialRules(rule);
                return;
            }
            const inner = [];
            for (const child of Array.from(rule.cssRules)) {
                flattenRule(child, parents, inner, omitted, omittedRuleCount);
            }
            if (inner.length) {
                const header = rule.cssText.slice(0, rule.cssText.indexOf('{')).trim();
                out.push(`${header} { ${inner.join(' ')} }`);
            }
        }
    };
    /*
      Removes the rules of a rule list that alfa cannot serialize and inserts flattened
      equivalents of rules nested in style rules immediately after them, so alfa receives
      their rules in cascade order. Containers are sheets or grouping rules.
    */
    const sanitize = (container, omitted, omittedRuleCount) => {
        for (let i = container.cssRules.length - 1; i >= 0; i--) {
            const rule = container.cssRules[i];
            if (!supported.has(tag(rule))) {
                omitted.add(tag(rule));
                omittedRuleCount.value += countMaterialRules(rule);
                container.deleteRule(i);
                continue;
            }
            if (rule instanceof CSSStyleRule) {
                if (rule.cssRules.length) {
                    const emitted = [];
                    const parents = splitList(rule.selectorText);
                    for (const child of Array.from(rule.cssRules)) {
                        flattenRule(child, parents, emitted, omitted, omittedRuleCount);
                    }
                    // Insert the flattened rules immediately after their parent.
                    emitted.reverse().forEach(text => {
                        try {
                            container.insertRule(text, i + 1);
                        }
                        catch (error) { }
                    });
                    // Remove the nested originals if the browser permits it; alfa ignores them anyway.
                    try {
                        while (rule.cssRules.length) {
                            rule.deleteRule(0);
                        }
                    }
                    catch (error) { }
                }
                continue;
            }
            if ('cssRules' in rule) {
                sanitize(rule, omitted, omittedRuleCount);
            }
        }
    };
    // Use the recorded lists of the page’s sheets, if any.
    const snapshot = document.__testaroAlfaSheets;
    const originalDOMSheets = snapshot ? snapshot.dom : Array.from(document.styleSheets);
    const originalAdoptedSheets = snapshot ? snapshot.adopted : Array.from(document.adoptedStyleSheets ?? []);
    const domCopies = [];
    const adoptedCopies = [];
    for (const kind of ['dom', 'adopted']) {
        const destination = kind === 'dom' ? domCopies : adoptedCopies;
        specs.filter(spec => spec.kind === kind)
            .sort((a, b) => b.index - a.index)
            .forEach(spec => {
            try {
                const copy = new CSSStyleSheet({ media: spec.media });
                copy.replaceSync(spec.text);
                copy.disabled = spec.disabled;
                const omitted = new Set();
                const omittedRuleCount = { value: 0 };
                sanitize(copy, omitted, omittedRuleCount);
                if (copy.cssRules.length) {
                    destination.push({ sheet: copy, spec, omitted, omittedRuleCount: omittedRuleCount.value });
                }
            }
            catch (error) { }
        });
    }
    const domView = [...originalDOMSheets];
    for (const { sheet, spec } of domCopies) {
        domView.splice(spec.index + 1, 0, sheet);
    }
    const adoptedView = [...originalAdoptedSheets];
    for (const { sheet, spec } of adoptedCopies) {
        adoptedView.splice(spec.index + 1, 0, sheet);
    }
    const styleSheetsDescriptor = Object.getOwnPropertyDescriptor(document, 'styleSheets');
    const adoptedStyleSheetsDescriptor = Object.getOwnPropertyDescriptor(document, 'adoptedStyleSheets');
    const restore = () => {
        if (styleSheetsDescriptor) {
            Object.defineProperty(document, 'styleSheets', styleSheetsDescriptor);
        }
        else {
            Reflect.deleteProperty(document, 'styleSheets');
        }
        if (adoptedStyleSheetsDescriptor) {
            Object.defineProperty(document, 'adoptedStyleSheets', adoptedStyleSheetsDescriptor);
        }
        else {
            Reflect.deleteProperty(document, 'adoptedStyleSheets');
        }
        Reflect.deleteProperty(document, '__testaroRestoreAlfaStyles');
    };
    try {
        Object.defineProperty(document, 'styleSheets', { configurable: true, get: () => domView });
        Object.defineProperty(document, 'adoptedStyleSheets', { configurable: true, get: () => adoptedView });
        Object.defineProperty(document, '__testaroRestoreAlfaStyles', {
            configurable: true,
            value: restore
        });
    }
    catch (error) {
        restore();
        throw error;
    }
    const allSheets = [...domView, ...adoptedView];
    const copies = [...domCopies, ...adoptedCopies].map(({ sheet, spec, omitted, omittedRuleCount }) => ({
        index: allSheets.indexOf(sheet),
        originalIndex: spec.index,
        kind: spec.kind,
        copyOf: spec.copyOf,
        rules: alfaView(sheet.cssRules),
        omitted: Array.from(omitted),
        omittedRuleCount,
        failedImports: spec.failedImports
    }));
    return copies;
}, { specs: plans, alfaTypes: Array.from(ALFA_RULE_TYPES) });
/*
  Prepares detached copies of sheets that deny rules to alfa. Sheets whose copies would change
  layer or nested-selector semantics are left uncompensated, so loss checking can prevent an
  incomplete audit.
*/
const injectSheetCopies = async (page, fetcher) => {
    const plans = await getCopyPlans(page);
    const specs = [];
    // The scheme family of the page, for confining file reads to local roots.
    const pageFamily = getSchemeFamily(page.url());
    for (const plan of plans) {
        // Get the text of the sheet: its serialized rules, or a fetch of its URL.
        let text = plan.text;
        if (text === null) {
            // A non-file page cannot have a file sheet, so a file URL is never read for one.
            if (!plan.href
                || (getSchemeFamily(plan.href) === 'file' && pageFamily !== 'file')) {
                continue;
            }
            text = await getSheetText(fetcher, plan.href, page.url());
            if (text === null) {
                continue;
            }
        }
        // Prepare the text for Alfa, inlining its imports.
        const resolved = await resolveSheetText(fetcher, text, plan.href ?? page.url());
        if (await isSafeCopy(page, resolved.text)) {
            specs.push({ ...plan, text: resolved.text, failedImports: resolved.failedImports });
        }
    }
    return injectCopies(page, specs);
};
/*
  Alfa reads a page’s styles by running a script in the page. It silently treats a sheet as empty if page scripts cannot read its rules (a cross-origin sheet requested without CORS) or if the sheet contains a rule type alfa does not support (such as @property or @container); it treats a @media block containing such a rule as empty; and it omits rules nested in style rules (CSS nesting). Alfa then tests the page as if those rules did not exist. Its enforceAnonymousCrossOrigin option reloads cross-origin sheets with CORS, making them readable, but a sheet whose server refuses CORS then fails to load, and the page as well as alfa loses its rules: Chromium and WebKit leave the sheet unreadable, and Firefox leaves it empty. This function reports the stylesheets whose material rules alfa did not receive. Sheets compensated by detached copies, and the copies themselves unless alfa still misses some of their rules, are not losses. It does not inspect sheets in shadow roots.
*/
// Gets the stylesheets of the page whose material rules alfa did not receive.
const getStyleLosses = async (page, fetcher, alfaSheets, copies = [], noReload = false) => {
    const losses = [];
    const { sheets: pageSheets, late: lateSheets } = await getPageSheets(page);
    const unreadableURLs = [];
    const emptyCrossOriginURLs = [];
    let alfaSheetIndex = 0;
    pageSheets.forEach(pageSheet => {
        const { sheet, isCrossOrigin, ruleCount, unreadableImports, kind, index } = pageSheet;
        const sourceAlfaIndex = alfaSheetIndex++;
        // If a detached copy is present, it follows its original in Alfa’s temporary sheet list.
        const copy = copies.find(item => item.kind === kind && item.originalIndex === index);
        if (copy) {
            alfaSheetIndex++;
            const alfaSheet = alfaSheets[copy.index];
            const alfaCount = alfaSheet ? countAlfaRules(alfaSheet.toJSON().rules) : 0;
            const unserializedRules = Math.max(0, copy.rules - alfaCount);
            // Report any rules of the copy that alfa did not serialize.
            if (unserializedRules) {
                losses.push({ sheet: copy.copyOf, reason: 'unserialized', ruleCount: unserializedRules });
            }
            // Report any material rules removed from the copy because alfa does not support them.
            if (copy.omittedRuleCount) {
                losses.push({ sheet: copy.copyOf, reason: 'unsupported', ruleCount: copy.omittedRuleCount });
            }
            // Check any imports of the original sheet that the copy could not inline.
            unreadableURLs.push(...copy.failedImports);
            return;
        }
        /*
          If the browser failed to load the sheet, the page itself lacks its rules, so alfa
          lacks nothing it should have — unless this job reloaded cross-origin sheets with
          CORS, in which case the failure may be the damage that reload caused.
        */
        if (pageSheet.loadFailed && noReload) {
            return;
        }
        // If page scripts cannot read the sheet:
        if (ruleCount === null) {
            /*
              A sheet requested in CORS mode that is unreadable failed to load: a successful
              CORS response would make it readable. The page itself then lacks its rules, so
              alfa lacks nothing it should have, provided this job did not reload sheets.
            */
            if (!noReload || !pageSheet.corsRequested) {
                // Postpone the decision until its text can be inspected.
                unreadableURLs.push(sheet);
            }
        }
        // Otherwise, if it is a cross-origin sheet that seems empty, perhaps because it failed to reload:
        else if (isCrossOrigin && ruleCount === 0) {
            /*
              A cross-origin sheet that loaded without CORS is either applied (and then unreadable)
              or failed (and then empty), so a readable empty one has no rules the page has — unless
              a CORS reload emptied it, which cannot happen when this job did not reload sheets.
            */
            if (!noReload) {
                // Postpone the decision until its text can be inspected.
                emptyCrossOriginURLs.push(sheet);
            }
        }
        else {
            const alfaSheet = alfaSheets[sourceAlfaIndex];
            const alfaCount = alfaSheet ? countAlfaRules(alfaSheet.toJSON().rules) : 0;
            // If alfa received fewer material rules than the page has:
            if (alfaCount < ruleCount) {
                losses.push({ sheet, reason: 'unserialized', ruleCount: ruleCount - alfaCount });
            }
        }
        unreadableURLs.push(...unreadableImports);
    });
    // A non-file page cannot have a file sheet, so a file URL is never followed for one.
    const pageFamily = getSchemeFamily(page.url());
    // For each sheet that page scripts cannot read:
    for (const url of unreadableURLs) {
        if (getSchemeFamily(url) === 'file' && pageFamily !== 'file') {
            continue;
        }
        const text = await getSheetText(fetcher, url, page.url());
        /*
          If its text cannot be fetched either, the page presumably lacks its rules: a dead
          link or unreachable host fails for the browser, too. It is then no loss of alfa’s,
          rather than a loss whose size cannot be known.
        */
        if (text !== null) {
            const ruleCount = await countTextRules(page, fetcher, text, url);
            // If it has material rules or they could not be counted, report it.
            if (ruleCount !== 0) {
                losses.push({ sheet: url, reason: 'unreadable', ruleCount });
            }
        }
    }
    // For each cross-origin sheet that seems empty:
    for (const url of emptyCrossOriginURLs) {
        if (getSchemeFamily(url) === 'file' && pageFamily !== 'file') {
            continue;
        }
        const text = await getSheetText(fetcher, url, page.url());
        // If its text is available:
        if (text !== null) {
            const ruleCount = await countTextRules(page, fetcher, text, url);
            // If it has material rules or rules of its imports could not be counted, report it.
            if (ruleCount !== 0) {
                losses.push({ sheet: url, reason: 'unloaded', ruleCount });
            }
        }
    }
    // For each sheet that the page added after its sheets were recorded, which alfa did not see:
    for (const lateSheet of lateSheets) {
        // If the page has its rules and they are material or cannot be counted, report it.
        if (!lateSheet.loadFailed && lateSheet.ruleCount !== 0) {
            losses.push({ sheet: lateSheet.sheet, reason: 'late', ruleCount: lateSheet.ruleCount });
        }
    }
    return losses;
};
// Conducts and reports the alfa tests.
const reporter = async (page, report, actIndex) => {
    const act = report.acts[actIndex];
    const { rules, reckless } = act;
    // If only some rules are to be employed:
    if (rules && rules.length) {
        // Remove the other rules.
        alfaRules = alfaRules.filter((rule) => rules.includes(rule.uri.replace(/^.+-/, '')));
    }
    // Initialize the act report.
    const data = {};
    const result = {
        nativeResult: {
            totals: {
                failed: 0,
                cantTell: 0
            },
            items: []
        },
        standardResult: {}
    };
    const standard = report.standard !== 'no';
    // If standard results are to be reported:
    if (standard) {
        // Initialize the standard result.
        result.standardResult = (0, standard_1.getStandardResult)();
    }
    try {
        try {
            // Wait for a stable page to make the page and its alfa version consistent.
            await page.waitForLoadState('networkidle', { timeout: (0, config_1.applyMultiplier)(9000) });
        }
        // If that fails:
        catch (error) {
            // Wait for the page to be loaded.
            await page.waitForLoadState('domcontentloaded', { timeout: (0, config_1.applyMultiplier)(6000) });
        }
        /*
          Under page isolation, the page is the live page of a checkpoint, which later acts observe,
          so it must remain unchanged. Alfa’s enforceAnonymousCrossOrigin option changes the page:
          it replaces every link element lacking a crossorigin attribute with a clone that has one,
          so the browser reloads it, and a stylesheet whose server refuses CORS then loses its
          rules. Under browser isolation it is still used, since each act gets a fresh page. Under
          process isolation, the default, detached stylesheet copies are exposed to alfa instead:
          they give alfa the rules without reloading or changing the page.
        */
        const isolation = report.jobData?.isolation;
        const isPageShared = isolation === 'page';
        const canInject = (isolation ?? 'process') === 'process';
        // Whether this job reloads cross-origin sheets with CORS (only browser isolation does).
        const sheetsReloaded = isolation === 'browser';
        /*
          Fetch stylesheets with the page’s own request context, unless the page is shared, in which
          case use a separate context, so that cookies set by the responses do not reach the page.
        */
        const proxy = isPageShared ? (0, config_1.getProxyLaunchOptions)(report.browserID ?? '').proxy : undefined;
        const fetcher = isPageShared
            ? await playwright_1.request.newContext({
                userAgent: await page.evaluate(() => navigator.userAgent),
                extraHTTPHeaders: (0, config_1.getScannerId)(report) ? { 'X-YRA-Scanner': (0, config_1.getScannerId)(report) } : {},
                storageState: await page.context().storageState(),
                ...(proxy ? { proxy } : {})
            })
            : page.request;
        let sheetCopies = [];
        let alfaPage;
        let styleLosses;
        // Whatever happens, release the recorded sheet lists and dispose of any separate context.
        try {
            try {
                if (canInject) {
                    // Record the page’s sheets, so all later steps use the same lists.
                    await snapshotSheets(page);
                    // Give alfa those lists, with copies of the sheets that would deny it rules.
                    sheetCopies = await injectSheetCopies(page, fetcher);
                }
            }
            catch (error) {
                console.log(`ERROR injecting stylesheet copies (${error.message})`);
                await page.evaluate(() => {
                    document
                        .__testaroRestoreAlfaStyles?.();
                });
                // Alfa will read the current lists of sheets, so loss checking must, too.
                await releaseSnapshot(page);
                sheetCopies = [];
            }
            const doc = await page.evaluateHandle('document');
            /*
              Get the alfa version of the page. Under browser isolation cross-origin sheets are first
              reloaded with CORS; under process isolation the detached copies already provide them.
            */
            alfaPage = await Playwright.toPage(doc, {
                enforceAnonymousCrossOrigin: sheetsReloaded
            }).finally(async () => {
                if (canInject) {
                    await page.evaluate(() => {
                        document
                            .__testaroRestoreAlfaStyles?.();
                    });
                }
            });
            // Get the stylesheets whose material rules alfa did not receive.
            styleLosses = await getStyleLosses(page, fetcher, Array.from(alfaPage.document.style), sheetCopies, !sheetsReloaded);
        }
        finally {
            await releaseSnapshot(page);
            if (isPageShared) {
                await fetcher.dispose();
            }
        }
        // Report any detached copies, for transparency about what alfa was given.
        if (sheetCopies.length) {
            data.sheetCopies = sheetCopies.map(({ index, originalIndex, ...copy }) => copy);
        }
        // If there are any:
        if (styleLosses.length) {
            // Report them.
            data.styleLosses = styleLosses;
            /*
              Get the sheets with losses that prevent the act: all but losses of rules of types alfa
              does not support and of sheets the page added after its sheets were recorded.
            */
            const preventingLosses = styleLosses.filter(loss => !tolerableReasons.has(loss.reason));
            // If there are any and the act does not permit testing a page with incomplete styles:
            if (preventingLosses.length && !reckless) {
                // Report the act as prevented.
                data.prevented = true;
                data.error = `Alfa cannot test page correctly because it lacks the style rules of ${preventingLosses.length} stylesheet${preventingLosses.length > 1 ? 's' : ''}`;
                if (standard) {
                    result.standardResult.prevented = true;
                }
                console.log(`ERROR: ${data.error}`);
                return {
                    data,
                    result
                };
            }
        }
        // Test the page content with the specified rules.
        const audit = Audit.of(alfaPage, alfaRules);
        // Get the evaluations.
        const evaluations = Array.from(await audit.evaluate());
        const { nativeResult, standardResult } = result;
        // For each of them:
        for (const index in evaluations) {
            const evaluation = evaluations[index];
            const targetClass = evaluation.target;
            // If it has a non-collection violator:
            if (targetClass && !targetClass._members) {
                // Convert the evaluation to an element-specific item.
                const item = evaluation.toJSON();
                const { diagnostic, expectations, outcome, rule, target } = item;
                // If the outcome of the item is a failure or warning:
                if (['failed', 'cantTell'].includes(outcome)) {
                    // Delete typically massive properties unlikely to be useful.
                    delete target.children;
                    if (diagnostic?.errors) {
                        diagnostic.errors.forEach(error => {
                            delete error.element;
                            delete error.positionedDescendants;
                        });
                    }
                    // Increment the applicable total.
                    nativeResult.totals[outcome]++;
                    const codeLines = targetClass.toString().split('\n');
                    if (codeLines[0] === '#document') {
                        codeLines.splice(2, codeLines.length - 3, ' … ');
                    }
                    else if (codeLines[0].startsWith('<html')) {
                        codeLines.splice(1, codeLines.length - 2, ' … ');
                    }
                    let code = codeLines.join('/n');
                    if (code.length > 400) {
                        code = `${code.slice(0, 300)} … ${code.slice(-100)}`;
                    }
                    // Add properties of the evaluation to the item.
                    item.code = code;
                    item.path = targetClass.path();
                    // Add the item to the items of the native result.
                    nativeResult.items.push(item);
                    // If standard results are to be reported:
                    if (standard) {
                        const { requirements, uri } = rule;
                        // Get the rule ID of the item.
                        const ruleID = uri.replace(/^.+-/, '');
                        // Get the rule description of the item.
                        let what = (expectations?.[0]?.[1]?.error?.message || '').trim().replace(/\s+/g, ' ');
                        if (!what) {
                            if (requirements && requirements.length && requirements[0].title) {
                                what = requirements[0].title;
                            }
                        }
                        // An untestable item keeps its rule ID; its outcome records the uncertainty. The
                        // contrast rules (r66, r69) cannot tell when a background needs human judgement.
                        const isCantTell = outcome === 'cantTell';
                        const xPath = (0, xPath_1.getNormalizedXPath)(item.path?.replace(/\/text\(\).*$/, '') || '/html');
                        // Add an instance to the standard instances.
                        (0, standard_1.addInstance)(standardResult, {
                            ruleID,
                            what,
                            ordinalSeverity: isCantTell ? 0 : 2,
                            outcome: isCantTell ? 'cantTell' : 'failed',
                            uncertainty: isCantTell && ['r66', 'r69'].includes(ruleID)
                                ? 'judgement-required'
                                : undefined,
                            catalogIndex: (0, xPath_1.getXPathCatalogIndex)(report, xPath)
                        });
                    }
                }
            }
        }
        ;
    }
    catch (error) {
        data.prevented = true;
        const { message } = error;
        if (message) {
            if (message.includes('Unsupported node of type: 4')) {
                data.error = 'Alfa cannot test page because it contains CDATA';
            }
            else {
                data.error = message;
            }
        }
        console.log(`ERROR: ${data.error}`);
    }
    return {
        data,
        result
    };
};
exports.reporter = reporter;
