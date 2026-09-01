"use strict";
/*
  © 2026 Jeff Witt.

  Licensed under the MIT License. See LICENSE file at the project root or
  https://opensource.org/license/mit/ for details.

  SPDX-License-Identifier: MIT
*/
Object.defineProperty(exports, "__esModule", { value: true });
exports.ruleModules = void 0;
// CONSTANTS
// Lazy loaders of the rule modules, keyed by rule ID.
exports.ruleModules = {
    adbID: () => require('./adbID'),
    allCapStyle: () => require('./allCapStyle'),
    allCaps: () => require('./allCaps'),
    allHidden: () => require('./allHidden'),
    allSlanted: () => require('./allSlanted'),
    altScheme: () => require('./altScheme'),
    attVal: () => require('./attVal'),
    autocomplete: () => require('./autocomplete'),
    bulk: () => require('./bulk'),
    buttonMenu: () => require('./buttonMenu'),
    captionLoc: () => require('./captionLoc'),
    datalistRef: () => require('./datalistRef'),
    distortion: () => require('./distortion'),
    docType: () => require('./docType'),
    dupAtt: () => require('./dupAtt'),
    elements: () => require('./elements'),
    embAc: () => require('./embAc'),
    focAll: () => require('./focAll'),
    focAndOp: () => require('./focAndOp'),
    focInd: () => require('./focInd'),
    focVis: () => require('./focVis'),
    headEl: () => require('./headEl'),
    headingAmb: () => require('./headingAmb'),
    hovInd: () => require('./hovInd'),
    hover: () => require('./hover'),
    hr: () => require('./hr'),
    imageLink: () => require('./imageLink'),
    labClash: () => require('./labClash'),
    legendLoc: () => require('./legendLoc'),
    lineHeight: () => require('./lineHeight'),
    linkAmb: () => require('./linkAmb'),
    linkExt: () => require('./linkExt'),
    linkOldAtt: () => require('./linkOldAtt'),
    linkTo: () => require('./linkTo'),
    linkUl: () => require('./linkUl'),
    miniText: () => require('./miniText'),
    motion: () => require('./motion'),
    nonTable: () => require('./nonTable'),
    optRoleSel: () => require('./optRoleSel'),
    phOnly: () => require('./phOnly'),
    pseudoP: () => require('./pseudoP'),
    radioSet: () => require('./radioSet'),
    role: () => require('./role'),
    secHeading: () => require('./secHeading'),
    styleDiff: () => require('./styleDiff'),
    tabNav: () => require('./tabNav'),
    targetsNear: () => require('./targetsNear'),
    textNodes: () => require('./textNodes'),
    textSem: () => require('./textSem'),
    title: () => require('./title'),
    titledEl: () => require('./titledEl'),
    zIndex: () => require('./zIndex'),
};
