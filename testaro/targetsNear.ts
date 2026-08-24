/*
  © 2023–2025 CVS Health and/or one of its affiliates. All rights reserved.
  © 2026 Jeff Witt.
  © 2025–2026 Jonathan Robert Pool.

  Licensed under the MIT License. See LICENSE file at the project root or  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/

// IMPORTS

import type {Page} from 'playwright';
import {getXPathCatalogIndex} from '../procs/xPath';
import type {Report, StandardInstance} from '../types';

/*
  targetsNear
  Related to Tenon rule 152.
  This test reports visible pointer targets, i.e. labels, buttons, inputs, and links, that are near enough to other targets to make pointer interaction difficult. This test relates to WCAG 2.2 Success Criteria 2.5.5 and 2.5.8, but does not attempt to implement either of them precisely. For example, the test reports a small pointer target that is far from all other targets, although it conforms to the Success Criteria.
  Compiled to targetsNear.js by tsc (issue #73); edit this file, not the emitted one.
*/

// FUNCTIONS

// Runs the test and returns the result.
export const reporter = async (page: Page, report: Report, _: unknown, withItems: boolean) => {
  // Return totals and standard instances for the rule.
  const protoResult = await page.evaluate(withItems => {
    // Get all pointer targets.
    const allTargets = Array.from(
      document.body.querySelectorAll<HTMLElement>('label, button, input, a')
    );
    // Get the visible ones.
    const visibleTargets = allTargets.filter(target => target.checkVisibility({
      contentVisibilityAuto: true,
      opacityProperty: true,
      visibilityProperty: true
    }));
    // For each visible one:
    const visibleBlockTargets = visibleTargets.filter(target => {
      const style = window.getComputedStyle(target);
      // If it is block-displayed:
      if (['block', 'list-item', 'table-cell'].includes(style.display)) {
        // Include it.
        return true;
      }
      const parent = target.parentElement;
      // Otherwise, if it has a parent:
      if (parent) {
        // If the parent has no additional text:
        if (parent.innerText === target.innerText) {
          const parentStyle = window.getComputedStyle(parent);
          // If the parent is block-displayed:
          if (['block', 'list-item', 'table-cell'].includes(parentStyle.display)) {
            // Include the target.
            return true;
          }
        }
      }
      // Otherwise, exclude it.
      return false;
    });
    // Initialize the data.
    const ptsData: [number, number][] = [];
    // For each visible block-displayed pointer target:
    visibleBlockTargets.forEach(element => {
      // Get the coordinates of its centerpoint.
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      // Add them to the data.
      ptsData.push([centerX, centerY]);
    });
    // Initialize the counts of minor and major violations.
    let violationCounts = [0, 0];
    const protoInstances: (StandardInstance & {xPath?: string})[] = [];
    // For each visible block-displayed pointer target:
    visibleBlockTargets.forEach((element, index) => {
      const [centerX, centerY] = ptsData[index];
      const otherPTsData = ptsData.toSpliced(index, 1);
      // Get the minimum of the vertical distances of its centerpoint from those of the others.
      const minYDiff = Math.min(...otherPTsData.map(ptData => Math.abs(centerY - ptData[1])));
      // If it is close enough to make a violation possible:
      if (minYDiff < 44) {
        // Get the centerpoint coordinates of those within that vertical distance.
        const yNearPTsData = otherPTsData.filter(
          ptData => Math.abs(ptData[1] - centerY) < 44
        );
        // Get the minimum of their planar distances.
        const minPlanarDistance = Math.min(...yNearPTsData.map(ptData => {
          const planarDistance = Math.sqrt(
            Math.pow(centerX - ptData[0], 2) + Math.pow(centerY - ptData[1], 2)
          );
          return planarDistance;
        }));
        // If the minimum planar distance is less than 44px:
        if (minPlanarDistance < 44) {
          // Get whether it is less than 24px.
          const isVeryNear = minPlanarDistance < 24;
          // Get the ordinal severity of the violation.
          const ordinalSeverity = isVeryNear ? 3 : 2;
          // Increment the applicable violation count.
          violationCounts[isVeryNear ? 1 : 0]++;
          // If itemization is required:
          if (withItems) {
            const what = `Pointer-target centerpoint is only ${Math.round(minPlanarDistance)}px from another one`;
            // Add a proto-instance to the proto-instances.
            protoInstances.push({
              ruleID: 'targetsNear',
              what,
              ordinalSeverity,
              count: 1,
              xPath: window.getXPath(element) ?? '/html'
            });
          }
        }
      }
    });
    // If itemization is not required:
    if (! withItems) {
      // If there were any major violations:
      if (violationCounts[1]) {
        // Add a summary instance to the proto-instances.
        protoInstances.push({
          ruleID: 'targetsNear',
          what: 'Pointer-target centerpoints are less than 24px from others',
          ordinalSeverity: 3,
          count: violationCounts[1]
        });
      }
      // If there were any minor violations:
      if (violationCounts[0]) {
        // Add a summary instance to the proto-instances.
        protoInstances.push({
          ruleID: 'targetsNear',
          what: 'Pointer-target centerpoints are less than 44px from others',
          ordinalSeverity: 2,
          count: violationCounts[0]
        });
      }
    }
    return {
      data: {},
      totals: [0, 0, ...violationCounts],
      standardInstances: protoInstances
    };
  }, withItems);
  // Convert the XPaths of the proto-instances to catalog indexes.
  protoResult.standardInstances = protoResult.standardInstances.map(instance => {
    const {xPath} = instance;
    // If the instance has an XPath:
    if (xPath) {
      // Ensure the catalog index of the instance is that with the XPath.
      instance.catalogIndex = getXPathCatalogIndex(report, xPath as string);
      // Delete the XPath from the instance.
      delete instance.xPath;
    }
    return instance;
  });
  // Return the result.
  return protoResult;
};
