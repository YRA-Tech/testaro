/*
  © 2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Page} from 'playwright';
import {getStyleResult} from '../procs/styleConsistency';
import type {StyledElement} from '../procs/styleConsistency';
import type {Report} from '../types';

/*
  linkStyles
  This test reports style differences among links of the same kind in the same landmark region. It assumes that an accessible page gives all its links of each kind in each region the same values on particular style properties, listed in the 'styleProps' array. A link’s region is its nearest landmark ancestor, or none if it has no landmark ancestor. A link’s kind is list link if it is the entire content of an item of a list, and otherwise adjacent link. A violation is a link’s value on one of those properties that is not the plurality value of that property among the links of its kind in its region, i.e. not more common than every other value. If 2 or more values tie for most common, every link of the group is a violator on that property. The properties exclude font properties, because a link inherits them from its context, such as a strong, em, or heading element, so they differ among links that are styled consistently. Links that are not rendered or have explicit roles other than link are not tested. This test uses the getBasicResult function (through getStyleResult) because a link’s verdict depends on the styles of all the links of its group.
  Compiled to linkStyles.js by tsc (issue #73); edit this file, not the emitted one.
*/

// CONSTANTS

// Selector of links.
const linkSelector = 'a[href], [role~=link]';
// Style properties to be compared.
const styleProps = [
  'color',
  'text-decoration-line',
  'text-decoration-style',
  'text-decoration-thickness',
  'background-color',
  'opacity',
  'outline-offset',
  'outline-style',
  'outline-width'
];

// FUNCTIONS

// Runs the test and returns the result.
export const reporter = async (page: Page, report: Report, _: unknown, withItems: boolean) => {
  const loc = page.locator(linkSelector);
  // Get the region, kind, and style-property values of each testable link, or null for any other element.
  const linkData = await loc.evaluateAll((elements, styleProps) => {
    // Landmark roles of elements with explicit roles.
    const landmarkRoles = [
      'banner', 'complementary', 'contentinfo', 'form', 'main', 'navigation', 'region', 'search'
    ];
    // Implicit landmark roles of elements by tag name.
    const tagRoles: Record<string, string> = {
      ASIDE: 'complementary',
      FOOTER: 'contentinfo',
      FORM: 'form',
      HEADER: 'banner',
      MAIN: 'main',
      NAV: 'navigation',
      SEARCH: 'search',
      SECTION: 'region'
    };
    // Landmark elements, each with an index identifying its region.
    const regionIndexes = new Map<Element, number>();
    // Returns the parent of an element in the flat tree, if any.
    const getParent = (element: Element) => {
      const root = element.getRootNode();
      return element.assignedSlot
      || element.parentElement
      || (root instanceof ShadowRoot ? root.host : null);
    };
    // Returns whether an element has an accessible name from its aria-label, aria-labelledby, or title attribute, with aria-labelledby counting only if it references an element with a nonempty text or aria-label.
    const isNamed = (element: Element) => {
      if (['aria-label', 'title'].some(attName => (element.getAttribute(attName) || '').trim())) {
        return true;
      }
      const root = element.getRootNode() as Document | ShadowRoot;
      return (element.getAttribute('aria-labelledby') || '').trim().split(/\s+/).some(id => {
        const labeler = id ? root.getElementById(id) : null;
        return Boolean(
          labeler
          && ((labeler.textContent || '').trim() || (labeler.getAttribute('aria-label') || '').trim())
        );
      });
    };
    // Returns the landmark role of an element, or null if it is not a landmark.
    const getLandmarkRole = (element: Element) => {
      const explicitRole = (element.getAttribute('role') || '').trim().split(/\s+/)[0];
      let role = explicitRole || tagRoles[element.tagName] || null;
      // If the element is a header or footer and has no explicit role:
      if (! explicitRole && ['HEADER', 'FOOTER'].includes(element.tagName)) {
        // It is not a landmark if it is in a sectioning element or main.
        let ancestor = getParent(element);
        while (ancestor) {
          if (['ARTICLE', 'ASIDE', 'MAIN', 'NAV', 'SECTION'].includes(ancestor.tagName)) {
            role = null;
            break;
          }
          ancestor = getParent(ancestor);
        }
      }
      // A form or region is a landmark only if it is named.
      if (role && ['form', 'region'].includes(role) && ! isNamed(element)) {
        role = null;
      }
      return role && landmarkRoles.includes(role) ? role : null;
    };
    // Returns the index and role of the region of an element.
    const getRegion = (element: Element): [number, string | null] => {
      let ancestor = getParent(element);
      while (ancestor) {
        const role = getLandmarkRole(ancestor);
        if (role) {
          if (! regionIndexes.has(ancestor)) {
            regionIndexes.set(ancestor, regionIndexes.size);
          }
          return [regionIndexes.get(ancestor)!, role];
        }
        ancestor = getParent(ancestor);
      }
      return [-1, null];
    };
    // Returns whether a node is significant content, i.e. not a comment or a text node of only spacing characters.
    const isSignificant = (node: Node) => node.nodeType === Node.ELEMENT_NODE
    || node.nodeType === Node.TEXT_NODE && (node.textContent || '').trim() !== '';
    // Returns whether a link is the entire content of an item of a list, i.e. the item contains nothing else, though the link may be wrapped in elements that contain nothing else.
    const isListLink = (link: Element) => {
      let content: Element = link;
      let container = link.parentElement;
      while (container) {
        const significantNodes = Array.from(container.childNodes).filter(isSignificant);
        if (significantNodes.length !== 1 || significantNodes[0] !== content) {
          return false;
        }
        if (container.tagName === 'LI') {
          return ['UL', 'OL', 'MENU'].includes(container.parentElement?.tagName || '');
        }
        content = container;
        container = container.parentElement;
      }
      return false;
    };
    return elements.map(element => {
      const role = (element.getAttribute('role') || '').trim();
      const isLinkRole = ! role || role.split(/\s+/)[0] === 'link';
      const isVisible = element.checkVisibility({
        contentVisibilityAuto: true,
        opacityProperty: true,
        visibilityProperty: true
      });
      if (isLinkRole && isVisible) {
        const [regionIndex, regionRole] = getRegion(element);
        const styleDec = window.getComputedStyle(element);
        return {
          regionIndex,
          regionRole,
          isList: isListLink(element),
          values: styleProps.map(styleProp => styleDec.getPropertyValue(styleProp))
        };
      }
      return null;
    });
  }, styleProps);
  // Group the testable links by region and kind, and get the nouns describing each group.
  const links: StyledElement[] = [];
  const groupNouns: Record<string, [string, string]> = {};
  linkData.forEach((datum, index) => {
    if (datum) {
      const {regionIndex, regionRole, isList, values} = datum;
      const group = `${regionIndex}:${isList ? 'list' : 'adjacent'}`;
      if (! groupNouns[group]) {
        const kind = isList ? 'list link' : 'link';
        let where = 'outside landmark regions';
        if (regionRole) {
          where = regionRole === 'region' ? 'in the same region' : `in the same ${regionRole} region`;
        }
        groupNouns[group] = [`${kind} ${where}`, `${kind}s ${where}`];
      }
      links.push({index, group, values});
    }
  });
  // Get and return a result.
  const whats = 'Links have style-property values that are not the most common among links of their kinds in their regions';
  return await getStyleResult(
    report, withItems, 'linkStyles', whats, loc, styleProps, links, group => groupNouns[group]
  );
};
