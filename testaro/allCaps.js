"use strict";
/*
  © 2023 CVS Health and/or one of its affiliates. All rights reserved.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.reporter = void 0;
// IMPORTS
const http = __importStar(require("http"));
const https = __importStar(require("https"));
// Function to build a standard instance.
const standard_1 = require("../procs/standard");
const xPath_1 = require("../procs/xPath");
const xPathScript_1 = require("../procs/xPathScript");
/*
  allCaps
  Related to Tenon rule 153.
  This test reports elements whose own text contains literal upper-case strings that are not intrinsically upper-case (i.e., not acronyms, abbreviations, or terms whose standard form is all-capitals). Upper-case text produced by styles is the subject of the allCapStyle rule, so this rule reads the characters of text nodes, unaffected by styles.
  The test examines the live page, so it tests the page state of the act's checkpoint, and, if the act's scope is changed, only the changed subtrees. A text node is owned by its parent element (or, directly in a shadow root, by the host). Each rendered element whose own text contains a run of 2 or more upper-case letters is a candidate, with the text of its nearest block ancestor around the runs as context. Candidates with identical runs and context are classified once. Claude Haiku estimates the probability that each violates the rule; up to 100 distinct candidates are classified, and violations among the others are estimated in proportion. If the AI call fails, the test falls back to a rule-based check for 8+ consecutive upper-case letters in an element's own text. Violations are reported in document order. The API is reached at ANTHROPIC_BASE_URL if set (as by the validation mock), else at https://api.anthropic.com.
  Compiled to allCaps.js by tsc (issue #73); edit this file, not the emitted one.
*/
// PARAMETERS
const MIN_CONFIDENCE = 0.8;
const MAX_MARGIN = 100;
const MAX_TOTAL = 2000;
const MAX_QUALIFYING = 100;
// CONSTANTS
const ruleID = 'allCaps';
const whats = 'Elements have all-capital text';
// FUNCTIONS
// Returns the candidates of a page in document order, within the scope roots if any.
const getCandidates = (page, scopeRoots) => page.evaluate(({ scopeRoots, maxMargin, maxTotal }) => {
    const excludedTags = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA']);
    // A run: 2+ consecutive capitals, even within a word (as in DECISIONmaker or antiCOAGULANT), with any following words that are entirely capitals (so that in WCAG-EM Overview the run is WCAG-EM).
    const runPattern = /\p{Lu}{2,}(?:[\s\p{Pd}]+\p{Lu}+(?!\p{L}))*/gu;
    // Returns text with its whitespace collapsed.
    const tidy = (text) => text.replace(/\s+/g, ' ');
    const roots = (scopeRoots ?? [])
        .map(selector => {
        try {
            return document.querySelector(selector);
        }
        catch {
            return null;
        }
    })
        .filter((root) => Boolean(root));
    // Returns whether an element is within a scope root, looking through shadow hosts.
    const isInScope = (element) => {
        let node = element;
        while (node) {
            if (roots.some(root => root.contains(node))) {
                return true;
            }
            const rootNode = node.getRootNode();
            node = rootNode instanceof ShadowRoot ? rootNode.host : null;
        }
        return false;
    };
    // Returns the nearest ancestor of an element (or the element) that is not inline.
    const getBlock = (element) => {
        let block = element;
        while (block.parentElement
            && ['inline', 'contents'].includes(window.getComputedStyle(block).display)) {
            block = block.parentElement;
        }
        return block;
    };
    // Own texts of the owners, in document order.
    const ownTexts = new Map();
    // Adds the qualifying text nodes in a tree, and in the open shadow roots within it.
    const collect = (root) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (node.nodeType === Node.ELEMENT_NODE) {
                const { shadowRoot } = node;
                if (shadowRoot) {
                    collect(shadowRoot);
                }
                continue;
            }
            const value = node.nodeValue ?? '';
            if (!/\p{Lu}{2,}/u.test(value)) {
                continue;
            }
            const parent = node.parentNode;
            const owner = parent instanceof Element
                ? parent
                : parent instanceof ShadowRoot ? parent.host : null;
            if (!owner
                || excludedTags.has(owner.tagName)
                || owner.closest('script, style, noscript, template, textarea')
                || (typeof owner.checkVisibility === 'function'
                    && !owner.checkVisibility({ visibilityProperty: true, opacityProperty: true }))
                || (roots.length && !isInScope(owner))
                || (scopeRoots && scopeRoots.length && !roots.length)) {
                continue;
            }
            if (!ownTexts.has(owner)) {
                ownTexts.set(owner, []);
            }
            ownTexts.get(owner).push(value);
        }
    };
    collect(document.body);
    const candidates = [];
    ownTexts.forEach((texts, owner) => {
        const ownText = tidy(texts.join(' ')).trim();
        const allRuns = ownText.match(runPattern) ?? [];
        const firstRun = allRuns[0];
        const lastRun = allRuns[allRuns.length - 1];
        if (!firstRun || !lastRun) {
            return;
        }
        const runs = Array.from(new Set(allRuns));
        // Get the literal text of the nearest block and the offset of the owner's text in it.
        const block = getBlock(owner);
        const blockText = tidy(block.textContent ?? '');
        let ownerOffset = 0;
        if (block !== owner) {
            const range = document.createRange();
            range.setStart(block, 0);
            range.setEndBefore(owner);
            ownerOffset = tidy(range.toString()).length;
        }
        // Get the context: the block text around the runs, starting from the owner's position, extended to whole words.
        const first = blockText.indexOf(firstRun, Math.max(0, ownerOffset - 1));
        const last = first > -1 ? blockText.lastIndexOf(lastRun, first + ownText.length) : -1;
        let text = ownText;
        if (first > -1 && last >= first) {
            let start = Math.max(0, first - maxMargin);
            let end = Math.min(blockText.length, last + lastRun.length + maxMargin);
            while (start > 0 && /\S/.test(blockText[start - 1] ?? '')) {
                start--;
            }
            while (end < blockText.length && /\S/.test(blockText[end] ?? '')) {
                end++;
            }
            text = blockText.slice(start, end).trim();
        }
        candidates.push({
            xPath: window.getXPath(owner) ?? '/html',
            tagName: owner.tagName,
            runs,
            text: text.slice(0, maxTotal),
            ownText
        });
    });
    return candidates;
}, { scopeRoots, maxMargin: MAX_MARGIN, maxTotal: MAX_TOTAL });
// Returns the classifications in the text of an AI response, i.e. its JSON array, keeping only those of entries that were sent; throws if there is no parsable array.
const getClassifications = (text, entries) => {
    const arrayText = text.slice(text.indexOf('['), text.lastIndexOf(']') + 1);
    const items = JSON.parse(arrayText);
    if (!Array.isArray(items)) {
        throw new Error('No classification array');
    }
    const sentIndexes = new Set(entries.map(entry => entry.index));
    return items
        .filter(item => item
        && sentIndexes.has(item.index)
        && typeof item.confidence === 'number'
        && item.confidence >= 0
        && item.confidence <= 1)
        .map(({ index, confidence }) => ({ index, confidence: Math.round(confidence * 10) / 10 }));
};
// Returns violations using the rule-based fallback (8+ consecutive uppercase letters in an element's own text).
const getRuleBasedViolations = (candidates) => candidates
    .map((candidate, position) => ({ candidate, position }))
    .filter(({ candidate }) => /\p{Lu}{8,}/u.test(candidate.ownText))
    .map(({ position }) => ({
    position,
    what: '[No AI available] Element contains all-capital text'
}));
// Sends qualifying entries to Claude Haiku and returns confidence scores.
const classifyWithAI = (entries) => new Promise((resolve, reject) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        reject(new Error('ANTHROPIC_API_KEY not set'));
        return;
    }
    const prompt = 'Classify HTML elements for an accessibility rule. All-capital text violates the rule UNLESS it is an acronym, abbreviation, or term whose standard form is all-capitals (NASA, WHO, etc.). Only the literal characters matter: the texts below are unaffected by styles.\n\n'
        + 'Each element has the runs of capitals in its own text and, as context, the text around them. For each element, give a confidence score (0.0–1.0, rounded to one decimal place) for the probability that the element VIOLATES the rule (its all-caps text is NOT intrinsically all-caps).\n\n'
        + 'Respond with ONLY a JSON array. Each element: {"index": <number>, "confidence": <number>}\n\n'
        + 'Elements:\n'
        + JSON.stringify(entries);
    const payload = JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }]
    });
    // Get the URL of the API, which a validator may replace with that of a mock.
    const apiURL = new URL(`${(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '')}/v1/messages`);
    const options = {
        hostname: apiURL.hostname,
        port: apiURL.port || undefined,
        path: apiURL.pathname,
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload)
        }
    };
    const request = apiURL.protocol === 'http:' ? http.request : https.request;
    const req = request(options, res => {
        let body = '';
        res.on('data', chunk => { body += chunk; });
        res.on('end', () => {
            try {
                const parsed = JSON.parse(body);
                if (parsed.error) {
                    reject(new Error(parsed.error.message));
                    return;
                }
                const classifications = getClassifications(parsed.content[0].text, entries);
                const { input_tokens, output_tokens } = parsed.usage;
                resolve({ classifications, aiModelUsage: { inputTokens: input_tokens, outputTokens: output_tokens } });
            }
            catch (error) {
                reject(new Error(`Haiku response error: ${error.message}`));
            }
        });
    });
    req.on('error', reject);
    req.setTimeout(20000, () => req.destroy(new Error('Haiku API timeout')));
    req.write(payload);
    req.end();
});
// Runs the test and returns the result.
const reporter = async (page, report, _, withItems) => {
    const data = {};
    const totals = [0, 0, 0, 0];
    const standardInstances = [];
    // Get the candidates, within the scope roots if the act's scope is changed.
    await (0, xPathScript_1.defineGetXPath)(page);
    const candidates = await getCandidates(page, report.ruleScopeRoots ?? null);
    data.candidateCount = candidates.length;
    // If there are none:
    if (!candidates.length) {
        // Report this.
        return { data, totals, standardInstances };
    }
    // Group the candidates with identical runs and context, to be classified once.
    const groups = new Map();
    candidates.forEach(({ runs, text }, position) => {
        const key = JSON.stringify([runs, text]);
        groups.set(key, [...(groups.get(key) ?? []), position]);
    });
    const distinct = Array.from(groups.values())
        .map((positions, index) => {
        const { tagName, runs, text } = candidates[positions[0]];
        return { entry: { index, tagName, runs, text }, positions };
    });
    data.distinctCandidateCount = distinct.length;
    // Sample them, with unbiased (Fisher–Yates) randomization.
    const sample = distinct.slice();
    for (let i = sample.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sample[i], sample[j]] = [sample[j], sample[i]];
    }
    // If their count exceeds the limit on AI assistance:
    if (sample.length > MAX_QUALIFYING) {
        // Truncate them.
        sample.length = MAX_QUALIFYING;
    }
    let violations;
    try {
        // Get AI estimates of the probabilities of their violating the rule.
        const { classifications, aiModelUsage } = await classifyWithAI(sample.map(({ entry }) => entry));
        data.aiModelUsage = aiModelUsage;
        // Treat the elements of the distinct candidates with above-minimum violation confidence levels as violations.
        violations = classifications
            .filter(({ confidence }) => confidence >= MIN_CONFIDENCE)
            .flatMap(({ index, confidence }) => distinct[index].positions.map(position => ({
            position,
            what: `Claude Haiku has ${Math.round(confidence * 100)}% confidence that the element contains unnecessarily all-capital text`
        })));
        // Count the elements of the classified and unclassified candidates.
        const evaluated = classifications.reduce((count, { index }) => count + distinct[index].positions.length, 0);
        const leftOut = candidates.length - evaluated;
        // If any elements were not classified and any were:
        if (leftOut > 0 && evaluated > 0) {
            // Add data about the estimated violation count among those not classified.
            data.leftOut = {
                count: leftOut,
                estimatedViolations: Math.round((violations.length / evaluated) * leftOut)
            };
        }
    }
    catch (error) {
        data.aiError = error.message;
        violations = getRuleBasedViolations(candidates);
    }
    // Report the violations in document order, not in the random order of the sample.
    violations.sort((a, b) => a.position - b.position);
    const estimatedLeftOut = data.leftOut?.estimatedViolations ?? 0;
    // Add the violation count, including the estimate, to the totals.
    totals[0] = violations.length + estimatedLeftOut;
    // The estimates are AI judgements, so every instance is uncertain.
    const certainty = { outcome: 'cantTell', uncertainty: 'judgement-required' };
    // If itemization is required:
    if (withItems) {
        // For each violation:
        for (const { position, what } of violations) {
            // Add an instance to the standard instances.
            const catalogIndex = (0, xPath_1.getXPathCatalogIndex)(report, candidates[position].xPath);
            standardInstances.push((0, standard_1.getInstance)({ ruleID, what, ordinalSeverity: 0, catalogIndex, ...certainty }));
        }
        // If any elements were not classified:
        if (estimatedLeftOut) {
            // Add a summary instance for them.
            standardInstances.push((0, standard_1.getInstance)({ ruleID, what: whats, ordinalSeverity: 0, count: estimatedLeftOut, ...certainty }));
        }
    }
    // Otherwise, i.e. if itemization is not required, and if any violations exist:
    else if (totals[0]) {
        // Add a summary instance for them.
        standardInstances.push((0, standard_1.getInstance)({ ruleID, what: whats, ordinalSeverity: 0, count: totals[0], ...certainty }));
    }
    return { data, totals, standardInstances };
};
exports.reporter = reporter;
