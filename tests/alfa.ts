/*
  © 2021–2024 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import {readFile} from 'fs/promises';
import {fileURLToPath} from 'url';
import {request} from 'playwright';
import type {APIRequestContext, Page} from 'playwright';
import {getNormalizedXPath, getXPathCatalogIndex} from '../procs/xPath';
import {getStandardResult, addInstance} from '../procs/standard';
import {applyMultiplier, getScannerId} from '../procs/config';
import type {Act, Report, StandardInstance, StandardResult} from '../types';
/*
  The alfa packages are pure ESM that Node loads via require(esm); their own
  types do not resolve under this project's node10 module resolution, so the
  imports stay requires and are untyped.
*/
let alfaRules = require('@siteimprove/alfa-rules').default;
const {Audit} = require('@siteimprove/alfa-act');
const {Playwright} = require('@siteimprove/alfa-playwright');

// TYPES

// The alfa-act properties this reporter consumes.
interface AlfaAct extends Act {
  rules?: string[];
  reckless?: boolean;
}
// A stylesheet of the page whose material rules alfa did not receive.
interface StyleLoss {
  // The URL of the sheet, or a description of an inline or constructed sheet.
  sheet: string;
  // Why alfa lacks the rules: the sheet failed to reload with CORS and is empty (as in Firefox), page scripts cannot read its rules (as also in Chromium and WebKit after a failed reload), or alfa did not serialize them.
  reason: 'unloaded' | 'unreadable' | 'unserialized';
  // How many material rules alfa lacks, or null if they could not be counted.
  ruleCount: number | null;
}
// A stylesheet of the page as page scripts see it.
interface PageSheet {
  sheet: string;
  // Whether the sheet comes from an origin other than the page’s.
  isCrossOrigin: boolean;
  // Material rules of the sheet, or null if page scripts cannot read them.
  ruleCount: number | null;
  // URLs of imported sheets whose rules page scripts cannot read.
  unreadableImports: string[];
  // Whether the browser failed to load the sheet, so the page has none of its rules.
  loadFailed?: boolean;
  // Whether the sheet was requested in CORS mode (its link has a crossorigin attribute).
  corsRequested?: boolean;
  // The name of the sheet a copy compensates if this sheet is one, else null.
  copyOf?: string | null;
  // Whether the sheet is compensated by an injected copy.
  compensated?: boolean;
}
// A plan for a copy of a stylesheet that would give alfa rules it cannot get from the sheet.
interface SheetCopyPlan {
  // The name of the sheet the copy compensates, as PageSheet.sheet names it.
  copyOf: string;
  // Whether the sheet is a document stylesheet (DOM) or an adopted (constructed) one.
  kind: 'dom' | 'adopted';
  // The index of the sheet in its own list (document.styleSheets or adoptedStyleSheets).
  index: number;
  // The URL of the sheet, or null if it has none.
  href: string | null;
  // The serialized rules of the sheet if page scripts can read them, else null.
  text: string | null;
  media: string;
  disabled: boolean;
}
// A stylesheet copy injected into the page to give alfa rules the sheet denies it.
interface SheetCopy {
  // The index of the copy in alfa’s sheet order (document stylesheets, then adopted ones).
  index: number;
  // Whether the copy is a document stylesheet (DOM) or an adopted (constructed) one.
  kind: 'dom' | 'adopted';
  // The name of the sheet the copy compensates.
  copyOf: string;
  // The material rules of the copy that alfa should serialize.
  rules: number;
  // Names of the rule types removed from the copy because alfa cannot serialize them.
  omitted: string[];
  // URLs of imported sheets whose texts could not be fetched for the copy.
  failedImports: string[];
}
// A rule in the JSON serialization of an alfa stylesheet.
interface AlfaRuleJSON {
  type: string;
  rules?: AlfaRuleJSON[];
}
// One evaluation of the audit, before JSON conversion.
interface AlfaEvaluation {
  target?: {
    _members?: unknown;
    toString: () => string;
    path: () => string;
  };
  toJSON: () => AlfaEvalItem;
}
// One element-specific item converted from an evaluation.
interface AlfaEvalItem {
  diagnostic?: {
    errors?: {
      element?: unknown;
      positionedDescendants?: unknown;
    }[];
  };
  expectations?: {
    error?: {
      message?: string;
    };
  }[][];
  outcome: string;
  rule: {
    requirements?: {title?: string}[];
    uri: string;
  };
  target?: {children?: unknown};
  code?: string;
  path?: string;
}
// The native result: violation totals and element-specific items.
interface AlfaNativeResult {
  totals: {
    failed: number;
    cantTell: number;
  };
  items: AlfaEvalItem[];
}

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
const countAlfaRules = (rules: AlfaRuleJSON[]): number => rules.reduce(
  (count, rule) => ['font-face', 'page'].includes(rule.type)
    ? count
    : count + 1 + countAlfaRules(rule.rules ?? []),
  0
);
// Gets the document stylesheets of the page as page scripts see them, in alfa’s order.
const getPageSheets = (page: Page): Promise<PageSheet[]> => page.evaluate(() => {
  // Identifies an injected copy and a sheet compensated by one.
  const copyOf = (sheet: StyleSheet): string | null => sheet.ownerNode instanceof HTMLStyleElement
    ? sheet.ownerNode.dataset.testaroAlfaCopy ?? null
    : null;
  const compensated = (sheet: StyleSheet): boolean => sheet.ownerNode instanceof Element
    && sheet.ownerNode.hasAttribute('data-testaro-alfa-compensated');
  // Counts the material rules in a list of rules, recording imports whose rules are unreadable.
  const countRules = (rules: CSSRuleList, unreadableImports: string[]): number => {
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
        count += countRules((rule as CSSGroupingRule).cssRules, unreadableImports);
      }
    }
    return count;
  };
  // Alfa serializes the document sheets first and then the constructed (adopted) sheets.
  const sheets = [...Array.from(document.styleSheets), ...(document.adoptedStyleSheets ?? [])];
  // Identify the sheets the browser failed to load, so losses are not claimed where the page itself lacks the rules.
  const failedLoads = new Set(
    (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .filter(entry => ((entry as PerformanceResourceTiming & {responseStatus?: number}).responseStatus ?? 0) >= 400)
      .map(entry => entry.name)
  );
  return sheets.map((sheet, index) => {
    const unreadableImports: string[] = [];
    const sheetName = sheet.href
      || (sheet.ownerNode ? `inline sheet ${index}` : `constructed sheet ${index}`);
    const isCrossOrigin = !! sheet.href && new URL(sheet.href).origin !== location.origin;
    let ruleCount: number | null = null;
    try {
      ruleCount = countRules(sheet.cssRules, unreadableImports);
    }
    catch (error) {}
    return {
      sheet: sheetName,
      isCrossOrigin,
      ruleCount,
      unreadableImports,
      loadFailed: !! sheet.href && failedLoads.has(sheet.href),
      corsRequested: sheet.ownerNode instanceof HTMLLinkElement
        && sheet.ownerNode.hasAttribute('crossorigin'),
      copyOf: copyOf(sheet),
      compensated: compensated(sheet)
    };
  });
});
// Returns the hrefs of the @import rules of a stylesheet text.
const getImportHrefs = (text: string): string[] => {
  // Erase comments, which can contain import-like text.
  let rest = text.replace(/\/\*[\s\S]*?\*\//g, ' ').trimStart();
  const hrefs: string[] = [];
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
const getSchemeFamily = (url: string): string => {
  if (url.startsWith('file:')) {
    return 'file';
  }
  if (/^https?:/.test(url)) {
    return 'http';
  }
  return url.startsWith('data:') ? 'data' : 'other';
};
// Gets the text of a stylesheet that page scripts cannot read, or null if it is unavailable.
const getSheetText = async (fetcher: APIRequestContext, url: string): Promise<string | null> => {
  try {
    const family = getSchemeFamily(url);
    // If the sheet is a local file (each file URL being an origin of its own):
    if (family === 'file') {
      // Read it.
      return await readFile(fileURLToPath(url), 'utf8');
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
      // Fetch it outside the page, where the cross-origin rule does not apply.
      const response = await fetcher.get(url, {timeout: applyMultiplier(5000)});
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
const countTextRules = async (
  page: Page, fetcher: APIRequestContext, text: string, url: string, visited: string[] = []
): Promise<number | null> => {
  try {
    // Count the sheet’s own material rules in a sheet constructed by the page, whose rules are readable.
    const ownCount = await page.evaluate(text => {
      const countRules = (rules: CSSRuleList): number => {
        let count = 0;
        for (const rule of Array.from(rules)) {
          if (rule instanceof CSSFontFaceRule || rule instanceof CSSPageRule) {
            continue;
          }
          count++;
          if ('cssRules' in rule) {
            count += countRules((rule as CSSGroupingRule).cssRules);
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
      let importURL: string;
      try {
        importURL = new URL(href, url).href;
      }
      catch (error) {
        continue;
      }
      const importFamily = getSchemeFamily(importURL);
      const isFollowable = importFamily === 'data' || importFamily === rootFamily;
      if (isFollowable && ! visitedNext.includes(importURL)) {
        const importText = await getSheetText(fetcher, importURL);
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
const getCopyPlans = (page: Page): Promise<SheetCopyPlan[]> => page.evaluate(alfaTypes => {
  const supported = new Set(alfaTypes);
  // Returns the name of the constructor of a rule, as alfa’s serializer recognizes it.
  const tag = (rule: CSSRule): string => rule.constructor?.name
    || Object.prototype.toString.call(rule).replace(/^\[object (.+)\]$/, '$1');
  /*
    Returns whether a list of rules contains anything alfa cannot fully serialize: a rule of
    a type its serializer does not support, a rule nested in a style rule (CSS nesting), or
    an import whose rules page scripts cannot read.
  */
  const deniesRules = (rules: CSSRuleList): boolean => {
    for (const rule of Array.from(rules)) {
      if (! supported.has(tag(rule))) {
        return true;
      }
      if (rule instanceof CSSImportRule && rule.styleSheet) {
        try {
          // Access throws for a cross-origin import not requested with CORS.
          void rule.styleSheet.cssRules;
        }
        catch (error) {
          return true;
        }
      }
      // Alfa does not serialize rules nested in style rules (CSS nesting).
      if (rule instanceof CSSStyleRule && rule.cssRules.length) {
        return true;
      }
      if ('cssRules' in rule && !(rule instanceof CSSStyleRule) && deniesRules((rule as CSSGroupingRule).cssRules)) {
        return true;
      }
    }
    return false;
  };
  const plans: SheetCopyPlan[] = [];
  // Alfa serializes the document sheets first and then the adopted sheets.
  Array.from(document.styleSheets).forEach((sheet, index) => {
    let readable = true;
    let unserializable = false;
    try {
      unserializable = deniesRules(sheet.cssRules);
    }
    catch (error) {
      readable = false;
    }
    // If the sheet denies rules to alfa:
    if (! readable || unserializable) {
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
  Array.from(document.adoptedStyleSheets ?? []).forEach((sheet, index) => {
    let unserializable = false;
    try {
      unserializable = deniesRules(sheet.cssRules);
    }
    catch (error) {}
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
const wrapImport = (text: string, tail: string): string => {
  let rest = tail.trim();
  // Extract the optional layer clause, whether named or anonymous.
  let layer: string | null = null;
  const layerMatch = rest.match(/layer\(([^)]*)\)|\blayer\b/i);
  if (layerMatch) {
    layer = layerMatch[1]?.trim() ?? '';
    rest = `${rest.slice(0, layerMatch.index)}${rest.slice((layerMatch.index ?? 0) + layerMatch[0].length)}`.trim();
  }
  // Extract the optional supports clause, balancing its parentheses.
  let supports: string | null = null;
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
    if (! depth) {
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
// Returns the text of a stylesheet with relative URLs made absolute against its base URL.
const absolutizeURLs = (text: string, baseURL: string): string => text.replace(
  /url\(\s*(['"]?)([^'")]+)\1\s*\)/g,
  (match, quote, href) => {
    try {
      return `url("${new URL(href.trim(), baseURL).href}")`;
    }
    catch (error) {
      return match;
    }
  }
);
/*
  Prepares the text of a stylesheet copy for injection: inlines the texts of its valid
  imports (each wrapped in its layer, supports, and media conditions), makes relative URLs
  absolute, and removes import statements a browser would ignore. Returns the resulting
  text and the URLs of imports whose texts could not be fetched.
*/
const resolveSheetText = async (
  fetcher: APIRequestContext, text: string, url: string, visited: string[] = []
): Promise<{text: string; failedImports: string[]}> => {
  const failedImports: string[] = [];
  // Erase comments, which can contain import-like text.
  let rest = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const blocks: string[] = [];
  /*
    An import rule is valid only before all other rules except charset rules and layer
    statements. Scan the leading statements and stop at the first other rule, as in
    getImportHrefs.
  */
  const importRE = /^@import\s+(?:url\(\s*["']?([^"')]+?)["']?\s*\)|["']([^"']+)["'])\s*([^;]*)(?:;|$)/i;
  const preludeRE = /^@(charset\s+["'][^"']*["']|layer\s+[^;{]+)\s*;/i;
  while (rest.length) {
    rest = rest.trimStart();
    const importMatch = rest.match(importRE);
    if (importMatch) {
      rest = rest.slice(importMatch[0].length);
      const href = (importMatch[1] ?? importMatch[2]).trim();
      let importURL: string | null = null;
      try {
        importURL = new URL(href, url).href;
      }
      catch (error) {}
      // If the import can be fetched and is not circular, inline it, else report it.
      if (importURL && ! visited.includes(importURL)) {
        const imported = await getSheetText(fetcher, importURL);
        if (imported === null) {
          failedImports.push(importURL);
        }
        else {
          const resolved = await resolveSheetText(
            fetcher, imported, importURL, [...visited, url]
          );
          failedImports.push(...resolved.failedImports);
          blocks.push(wrapImport(resolved.text, importMatch[3] ?? ''));
        }
      }
      else if (! importURL) {
        failedImports.push(href);
      }
      continue;
    }
    const preludeMatch = rest.match(preludeRE);
    if (preludeMatch) {
      rest = rest.slice(preludeMatch[0].length);
      // Keep layer statements, which order layers, but drop charset declarations.
      if (preludeMatch[0].toLowerCase().startsWith('@layer')) {
        blocks.push(preludeMatch[0]);
      }
      continue;
    }
    break;
  }
  // Remove statements a browser would ignore after other rules.
  rest = rest
    .replace(/@import\s[^;]*;/gi, ' ')
    .replace(/@charset\s+["'][^"']*["']\s*;/gi, ' ');
  return {
    text: `${blocks.join('\n')}\n${absolutizeURLs(rest, url)}`,
    failedImports
  };
};
/*
  Injects copies of the stylesheets named in the plans into the page, each immediately after
  its original so the cascade order is preserved, then removes the rules alfa cannot
  serialize and replaces rules nested in style rules with equivalent unnested rules. The
  copies add rules to the page but remove none, so the presented page stays as it was.
  Returns the injected copies, or rather the properties of theirs that loss checking needs.
*/
const injectCopies = (page: Page, plans: (SheetCopyPlan & {text: string})[]): Promise<Omit<SheetCopy, 'failedImports'>[]> => page.evaluate((args: {
  specs: (SheetCopyPlan & {text: string})[];
  alfaTypes: string[];
}) => {
  const {specs, alfaTypes} = args;
  const supported = new Set(alfaTypes);
  // Returns the name of the constructor of a rule, as alfa’s serializer recognizes it.
  const tag = (rule: CSSRule): string => rule.constructor?.name
    || Object.prototype.toString.call(rule).replace(/^\[object (.+)\]$/, '$1');
  // Counts the material rules of a rule list as alfa counts them: grouping rules and their contents count, but rules nested in style rules do not.
  const alfaView = (rules: CSSRuleList): number => {
    let count = 0;
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSFontFaceRule || rule instanceof CSSPageRule) {
        continue;
      }
      count++;
      if ('cssRules' in rule && !(rule instanceof CSSStyleRule)) {
        count += alfaView((rule as CSSGroupingRule).cssRules);
      }
    }
    return count;
  };
  // Splits a selector list on commas not enclosed in parentheses, brackets, or quotes.
  const splitList = (selector: string): string[] => {
    const parts: string[] = [];
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
      else if (char === ',' && ! depth) {
        parts.push(selector.slice(start, i));
        start = i + 1;
      }
    }
    parts.push(selector.slice(start));
    return parts.map(part => part.trim()).filter(Boolean);
  };
  // Expands each nested selector against each parent selector, substituting or descending.
  const combine = (parents: string[], nested: string[]): string[] => parents.flatMap(
    parent => nested.map(
      selector => selector.includes('&')
        ? selector.replace(/&/g, parent)
        : `${parent} ${selector}`
    )
  );
  /*
    Appends to out the text of a rule nested in a style rule, made equivalent to top-level
    rules by expanding its selectors against those of its ancestors. Grouping rules keep
    their headers; their contents are flattened recursively.
  */
  const flattenRule = (
    rule: CSSRule, parents: string[], out: string[], omitted: Set<string>
  ): void => {
    if (rule instanceof CSSStyleRule) {
      const selectors = combine(parents, splitList(rule.selectorText));
      out.push(`${selectors.join(', ')} { ${rule.style.cssText} }`);
      for (const child of Array.from(rule.cssRules)) {
        flattenRule(child, selectors, out, omitted);
      }
    }
    // A rule bearing declarations but no selector is a nested-declarations rule.
    else if ('style' in rule) {
      out.push(`${parents.join(', ')} { ${(rule as CSSStyleRule).style.cssText} }`);
    }
    else if ('cssRules' in rule) {
      if (! supported.has(tag(rule))) {
        omitted.add(tag(rule));
        return;
      }
      const inner: string[] = [];
      for (const child of Array.from((rule as CSSGroupingRule).cssRules)) {
        flattenRule(child, parents, inner, omitted);
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
  const sanitize = (
    container: CSSStyleSheet | CSSGroupingRule, omitted: Set<string>
  ): void => {
    for (let i = container.cssRules.length - 1; i >= 0; i--) {
      const rule = container.cssRules[i];
      if (! supported.has(tag(rule))) {
        omitted.add(tag(rule));
        container.deleteRule(i);
        continue;
      }
      if (rule instanceof CSSStyleRule) {
        if (rule.cssRules.length) {
          const emitted: string[] = [];
          const parents = splitList(rule.selectorText);
          for (const child of Array.from(rule.cssRules)) {
            flattenRule(child, parents, emitted, omitted);
          }
          // Insert the flattened rules immediately after their parent.
          emitted.reverse().forEach(text => {
            try {
              container.insertRule(text, i + 1);
            }
            catch (error) {}
          });
          // Remove the nested originals if the browser permits it; alfa ignores them anyway.
          try {
            while (rule.cssRules.length) {
              rule.deleteRule(0);
            }
          }
          catch (error) {}
        }
        continue;
      }
      if ('cssRules' in rule) {
        sanitize(rule as CSSGroupingRule, omitted);
      }
    }
  };
  const copies: Omit<SheetCopy, 'failedImports'>[] = [];
  // Inject copies of adopted sheets in descending index order to keep the indexes valid.
  const adoptedCopies: {sheet: CSSStyleSheet; spec: SheetCopyPlan & {text: string}}[] = [];
  specs.filter(spec => spec.kind === 'adopted')
    .sort((a, b) => b.index - a.index)
    .forEach(spec => {
      try {
        const copy = new CSSStyleSheet();
        copy.replaceSync(spec.text);
        const adopted = Array.from(document.adoptedStyleSheets ?? []);
        adopted.splice(spec.index + 1, 0, copy);
        document.adoptedStyleSheets = adopted;
        copy.disabled = spec.disabled;
        adoptedCopies.push({sheet: copy, spec});
      }
      catch (error) {}
    });
  // Inject copies of document sheets in descending index order to keep the indexes valid.
  const elements: {element: HTMLStyleElement; spec: SheetCopyPlan & {text: string}}[] = [];
  specs.filter(spec => spec.kind === 'dom')
    .sort((a, b) => b.index - a.index)
    .forEach(spec => {
      const element = document.createElement('style');
      element.setAttribute('data-testaro-alfa-copy', spec.copyOf);
      if (spec.media) {
        element.media = spec.media;
      }
      element.textContent = spec.text;
      const owner = document.styleSheets[spec.index]?.ownerNode;
      if (owner && owner.parentNode) {
        owner.after(element);
        // Mark the original as compensated, since its name is index-based and can shift.
        if (owner instanceof Element) {
          owner.setAttribute('data-testaro-alfa-compensated', spec.copyOf);
        }
      }
      else {
        document.head.appendChild(element);
      }
      if (element.sheet) {
        element.sheet.disabled = spec.disabled;
      }
      elements.push({element, spec});
    });
  // Sanitize each copy and record it if it received any rules (CSP can block style elements).
  const allSheets = () => [
    ...Array.from(document.styleSheets),
    ...Array.from(document.adoptedStyleSheets ?? [])
  ];
  for (const {element, spec} of elements) {
    const {sheet} = element;
    if (! sheet || ! spec.text.trim()) {
      continue;
    }
    const omitted = new Set<string>();
    try {
      sanitize(sheet as CSSStyleSheet, omitted);
    }
    catch (error) {}
    if (! sheet.cssRules.length) {
      element.remove();
      continue;
    }
    copies.push({
      index: allSheets().indexOf(sheet),
      kind: 'dom',
      copyOf: spec.copyOf,
      rules: alfaView(sheet.cssRules),
      omitted: Array.from(omitted)
    });
  }
  // Sanitize and record each adopted copy that received any rules.
  for (const {sheet: copy, spec} of adoptedCopies) {
    const omitted = new Set<string>();
    try {
      sanitize(copy, omitted);
    }
    catch (error) {}
    if (! copy.cssRules.length) {
      continue;
    }
    copies.push({
      index: allSheets().indexOf(copy),
      kind: 'adopted',
      copyOf: spec.copyOf,
      rules: alfaView(copy.cssRules),
      omitted: Array.from(omitted)
    });
  }
  return copies;
}, {specs: plans, alfaTypes: Array.from(ALFA_RULE_TYPES)});
/*
  Injects into the page a copy of each stylesheet that denies rules to alfa: each sheet that
  page scripts cannot read or that contains rules alfa cannot serialize. The text of an
  unreadable sheet is fetched outside the page. Copies leave the original sheets unchanged.
*/
const injectSheetCopies = async (page: Page, fetcher: APIRequestContext): Promise<SheetCopy[]> => {
  const plans = await getCopyPlans(page);
  const specs: (SheetCopyPlan & {text: string; failedImports: string[]})[] = [];
  for (const plan of plans) {
    // Get the text of the sheet: its serialized rules, or a fetch of its URL.
    let text = plan.text;
    if (text === null) {
      if (! plan.href) {
        continue;
      }
      text = await getSheetText(fetcher, plan.href);
      if (text === null) {
        continue;
      }
    }
    // Prepare the text for injection, inlining its imports.
    const resolved = await resolveSheetText(fetcher, text, plan.href ?? page.url());
    specs.push({...plan, text: resolved.text, failedImports: resolved.failedImports});
  }
  const copies = await injectCopies(page, specs);
  // Add the failed imports of each plan to its copy.
  return copies.map(copy => ({
    ...copy,
    failedImports: specs.find(spec => spec.copyOf === copy.copyOf)?.failedImports ?? []
  }));
};
/*
  Alfa reads a page’s styles by running a script in the page. It silently treats a sheet as empty if page scripts cannot read its rules (a cross-origin sheet requested without CORS) or if the sheet contains a rule type alfa does not support (such as @property or @container); it treats a @media block containing such a rule as empty; and it omits rules nested in style rules (CSS nesting). Alfa then tests the page as if those rules did not exist. Its enforceAnonymousCrossOrigin option reloads cross-origin sheets with CORS, making them readable, but a sheet whose server refuses CORS then fails to load, and the page as well as alfa loses its rules: Chromium and WebKit leave the sheet unreadable, and Firefox leaves it empty. This function reports the stylesheets whose material rules alfa did not receive. Sheets compensated by injected copies, and the copies themselves unless alfa still misses some of their rules, are not losses. It does not inspect sheets in shadow roots.
*/
// Gets the stylesheets of the page whose material rules alfa did not receive.
const getStyleLosses = async (
  page: Page,
  fetcher: APIRequestContext,
  alfaSheets: {toJSON: () => {rules: AlfaRuleJSON[]}}[],
  copies: SheetCopy[] = [],
  noReload = false
): Promise<StyleLoss[]> => {
  const losses: StyleLoss[] = [];
  const pageSheets = await getPageSheets(page);
  const copyByName = new Map(copies.map(copy => [copy.copyOf, copy]));
  // Adopted copies cannot mark their sheets, so they are recognized by index.
  const adoptedCopyByIndex = new Map(
    copies.filter(copy => copy.kind === 'adopted').map(copy => [copy.index, copy])
  );
  // Each adopted sheet with a copy sits immediately before its copy in sheet order.
  const adoptedCompensated = new Set(
    copies.filter(copy => copy.kind === 'adopted').map(copy => copy.index - 1)
  );
  const unreadableURLs: string[] = [];
  const emptyCrossOriginURLs: string[] = [];
  pageSheets.forEach((pageSheet, index) => {
    const {sheet, isCrossOrigin, ruleCount, unreadableImports} = pageSheet;
    // If the sheet is a copy, alfa should have received all its rules.
    const copy = pageSheet.copyOf
      ? copyByName.get(pageSheet.copyOf)
      : adoptedCopyByIndex.get(index);
    if (copy) {
      const alfaSheet = alfaSheets[index];
      const alfaCount = alfaSheet ? countAlfaRules(alfaSheet.toJSON().rules) : 0;
      // If alfa received fewer material rules than the copy has, report a residual loss.
      if (alfaCount < copy.rules) {
        losses.push({sheet: copy.copyOf, reason: 'unserialized', ruleCount: copy.rules - alfaCount});
      }
      // Check any imports of the original sheet that the copy could not inline.
      unreadableURLs.push(...copy.failedImports);
      return;
    }
    // If the sheet is compensated by a copy, it is no loss.
    if (pageSheet.compensated || adoptedCompensated.has(index)) {
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
      if (! noReload || ! pageSheet.corsRequested) {
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
      if (! noReload) {
        // Postpone the decision until its text can be inspected.
        emptyCrossOriginURLs.push(sheet);
      }
    }
    else {
      const alfaSheet = alfaSheets[index];
      const alfaCount = alfaSheet ? countAlfaRules(alfaSheet.toJSON().rules) : 0;
      // If alfa received fewer material rules than the page has:
      if (alfaCount < ruleCount) {
        losses.push({sheet, reason: 'unserialized', ruleCount: ruleCount - alfaCount});
      }
    }
    unreadableURLs.push(...unreadableImports);
  });
  // For each sheet that page scripts cannot read:
  for (const url of unreadableURLs) {
    const text = await getSheetText(fetcher, url);
    const ruleCount = text === null ? null : await countTextRules(page, fetcher, text, url);
    // If it has material rules or they could not be counted, report it.
    if (ruleCount !== 0) {
      losses.push({sheet: url, reason: 'unreadable', ruleCount});
    }
  }
  // For each cross-origin sheet that seems empty:
  for (const url of emptyCrossOriginURLs) {
    const text = await getSheetText(fetcher, url);
    // If its text is available:
    if (text !== null) {
      const ruleCount = await countTextRules(page, fetcher, text, url);
      // If it has material rules or rules of its imports could not be counted, report it.
      if (ruleCount !== 0) {
        losses.push({sheet: url, reason: 'unloaded', ruleCount});
      }
    }
  }
  return losses;
};
// Conducts and reports the alfa tests.
export const reporter = async (page: Page, report: Report, actIndex: number) => {
  const act = report.acts[actIndex] as AlfaAct;
  const {rules, reckless} = act;
  // If only some rules are to be employed:
  if (rules && rules.length) {
    // Remove the other rules.
    alfaRules = alfaRules.filter(
      (rule: {uri: string}) => rules.includes(rule.uri.replace(/^.+-/, ''))
    );
  }
  // Initialize the act report.
  const data: {
    prevented?: boolean;
    error?: string;
    styleLosses?: StyleLoss[];
    sheetCopies?: Omit<SheetCopy, 'index'>[];
  } = {};
  const result: {nativeResult: AlfaNativeResult; standardResult: StandardResult} = {
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
    result.standardResult = getStandardResult();
  }
  try {
    try {
      // Wait for a stable page to make the page and its alfa version consistent.
      await page.waitForLoadState('networkidle', {timeout: applyMultiplier(9000)});
    }
    // If that fails:
    catch (error) {
      // Wait for the page to be loaded.
      await page.waitForLoadState('domcontentloaded', {timeout: applyMultiplier(6000)});
    }
    /*
      Under page isolation, the page is the live page of a checkpoint, which later acts observe,
      so it must remain unchanged. Alfa’s enforceAnonymousCrossOrigin option changes the page:
      it replaces every link element lacking a crossorigin attribute with a clone that has one,
      so the browser reloads it, and a stylesheet whose server refuses CORS then loses its
      rules. Under browser isolation it is still used, since each act gets a fresh page. Under
      process isolation, the default, stylesheet copies are injected instead: they give alfa
      the rules without reloading anything, so the page loses no rules.
    */
    const isolation = report.jobData?.isolation;
    const isPageShared = isolation === 'page';
    const canInject = (isolation ?? 'process') === 'process';
    /*
      Fetch stylesheets with the page’s own request context, unless the page is shared, in which
      case use a separate context, so that cookies set by the responses do not reach the page.
    */
    const fetcher = isPageShared
      ? await request.newContext({
        userAgent: await page.evaluate(() => navigator.userAgent),
        extraHTTPHeaders: getScannerId(report) ? {'X-YRA-Scanner': getScannerId(report)} : {}
      })
      : page.request;
    let sheetCopies: SheetCopy[] = [];
    try {
      if (canInject) {
        // Give alfa copies of the sheets that would deny it rules.
        sheetCopies = await injectSheetCopies(page, fetcher);
      }
    }
    catch (error) {
      console.log(`ERROR injecting stylesheet copies (${(error as Error).message})`);
      sheetCopies = [];
    }
    const doc = await page.evaluateHandle('document');
    /*
      Get the alfa version of the page. Under browser isolation cross-origin sheets are first
      reloaded with CORS; under process isolation the injected copies already provide them.
    */
    const alfaPage = await Playwright.toPage(doc, {
      enforceAnonymousCrossOrigin: isolation === 'browser'
    });
    let styleLosses: StyleLoss[];
    try {
      // Get the stylesheets whose material rules alfa did not receive.
      styleLosses = await getStyleLosses(
        page, fetcher, Array.from(alfaPage.document.style), sheetCopies, canInject
      );
    }
    finally {
      if (isPageShared) {
        await fetcher.dispose();
      }
    }
    // Report any injected copies, for transparency about what alfa was given.
    if (sheetCopies.length) {
      data.sheetCopies = sheetCopies.map(({index, ...copy}) => copy);
    }
    // If there are any:
    if (styleLosses.length) {
      // Report them.
      data.styleLosses = styleLosses;
      // If the act does not permit testing a page with incomplete styles:
      if (! reckless) {
        // Report the act as prevented.
        data.prevented = true;
        data.error = `Alfa cannot test page correctly because it lacks the style rules of ${styleLosses.length} stylesheet${styleLosses.length > 1 ? 's' : ''}`;
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
    const evaluations: AlfaEvaluation[] = Array.from(await audit.evaluate());
    const {nativeResult, standardResult} = result;
    // For each of them:
    for (const index in evaluations) {
      const evaluation = evaluations[index as unknown as number];
      const targetClass = evaluation.target;
      // If it has a non-collection violator:
      if (targetClass && ! targetClass._members) {
        // Convert the evaluation to an element-specific item.
        const item = evaluation.toJSON();
        const {diagnostic, expectations, outcome, rule, target} = item;
        // If the outcome of the item is a failure or warning:
        if (['failed', 'cantTell'].includes(outcome)) {
          // Delete typically massive properties unlikely to be useful.
          delete target!.children;
          if (diagnostic?.errors) {
            diagnostic.errors.forEach(error => {
              delete error.element;
              delete error.positionedDescendants;
            });
          }
          // Increment the applicable total.
          nativeResult.totals[outcome as 'failed' | 'cantTell']++;
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
            const {requirements, uri} = rule;
            // Get the rule ID of the item.
            const ruleID = uri.replace(/^.+-/, '');
            // Get the rule description of the item.
            let what = (expectations?.[0]?.[1]?.error?.message || '').trim().replace(/\s+/g, ' ');
            if (! what) {
              if (requirements && requirements.length && requirements[0].title) {
                what = requirements[0].title;
              }
            }
            // An untestable item keeps its rule ID; its outcome records the uncertainty. The
            // contrast rules (r66, r69) cannot tell when a background needs human judgement.
            const isCantTell = outcome === 'cantTell';
            const xPath = getNormalizedXPath(item.path?.replace(/\/text\(\).*$/, '') || '/html');
            // Add an instance to the standard instances.
            addInstance(standardResult, {
              ruleID,
              what,
              ordinalSeverity: isCantTell ? 0 : 2,
              outcome: isCantTell ? 'cantTell' : 'failed',
              uncertainty: isCantTell && ['r66', 'r69'].includes(ruleID)
                ? 'judgement-required'
                : undefined,
              catalogIndex: getXPathCatalogIndex(report, xPath)
            });
          }
        }
      }
    };
  }
  catch(error) {
    data.prevented = true;
    const {message} = error as Error;
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
