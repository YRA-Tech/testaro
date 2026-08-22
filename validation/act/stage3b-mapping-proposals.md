# Stage-3b mapping proposals — pour

Capture: `validation/act/results/stage3a-2026-08-22.jsonl` · taxonomy: `tic50.js` · thresholds: rate ≥ 0.25, ≥ 5 elements on ≥ 3 pages. Exact-path co-occurrence is a floor; proposals require human accept/reject/split review.

| Candidate rule | Elements | Pages | Proposed issue | Co-rate | Lift | Runners-up | Suggestion | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| color-contrast-enhanced | 12965 | 222 | contrastAAA | 43% (5611) | 4.5 | contrastAA (5058, lift 4.1); contrastRisk (1746, lift 3.0) | map | |
| target-size-enhanced | 8992 | 248 | — | 2% (171) | 5.1 | linkTextsSame (667, lift 3.4); newTabSurprise (565, lift 3.5) | new-issue candidate | |
| color-contrast | 8775 | 213 | contrastAA | 49% (4287) | 5.1 | contrastRisk (1639, lift 4.2); linkVaguenessRisk (27, lift 8.0) | map | |
| region | 8013 | 150 | — | 0% (28) | 9.0 | contentBeyondLandmarks (722, lift 3.1); imageNoText (141, lift 3.5) | new-issue candidate | |
| new-window-link | 1697 | 196 | newTabSurprise | 63% (1064) | 34.4 | nonWebLink (18, lift 20.4); linkIndication (31, lift 16.2) | map | |
| svg-img-alt | 818 | 87 | — | 24% (194) | 8.4 | svgImageNoText (1, lift 11.1); eventKeyboardRisk (2, lift 6.2) | new-issue candidate | |
| target-size | 678 | 58 | — | 1% (8) | 26.7 | ignorable (551, lift 1.2); linkConfusionRisk (8, lift 3.2) | new-issue candidate | |
| text-spacing | 580 | 61 | — | 2% (10) | 22.3 | dialogNoText (1, lift 31.2); inputNoText (1, lift 22.3) | new-issue candidate | |
| link-name | 536 | 88 | imageLinkNoText | 60% (319) | 115.4 | linkNoText (509, lift 91.1); newTabSurprise (127, lift 13.0) | map | |
| redundant-aria-label | 510 | 63 | — | 2% (9) | 53.3 | linkTextsSame (47, lift 4.3); ariaAttributeBad (16, lift 5.8) | new-issue candidate | |
| image-alt | 484 | 69 | imageNoText | 67% (322) | 133.9 | imageTextBad (31, lift 175.8); linkPair (7, lift 13.2) | map | |
| landmark-unique | 480 | 75 | bannerNotTop | 27% (131) | 177.9 | mainNotTop (111, lift 179.0); landmarkConfusion (91, lift 177.0) | map | |
| redundant-tabindex | 479 | 60 | — | 3% (16) | 10.9 | ariaAttributeBad (23, lift 8.9); visibleLabelNotInName (19, lift 4.7) | new-issue candidate | |
| redundant-aria | 337 | 61 | — | 15% (52) | 57.8 | activeEmbedding (8, lift 76.8); focusableDescendants (8, lift 21.7) | new-issue candidate | |
| landmark-top-level | 302 | 37 | bannerNotTop | 45% (135) | 291.3 | mainNotTop (112, lift 287.1); footerNotTop (6, lift 257.1) | map | |
| link-text-generic | 279 | 77 | — | 12% (33) | 306.1 | linkTextsSame (172, lift 28.5); linkConfusionRisk (36, lift 34.9) | new-issue candidate | |
| link-text-generic-only | 279 | 77 | — | 12% (33) | 306.1 | linkTextsSame (172, lift 28.5); linkConfusionRisk (36, lift 34.9) | new-issue candidate | |
| aria-hidden-focus | 231 | 27 | focusableHidden | 88% (204) | 377.4 | ignorable (120, lift 0.8); boxSizeAbsolute (5, lift 0.8) | map | |
| non-text-contrast | 190 | 90 | — | 3% (6) | 476.8 | labelConfusionRisk (86, lift 121.7); controlLabelInvisible (2, lift 476.8) | new-issue candidate | |
| nested-interactive | 183 | 29 | — | 14% (25) | 442.0 | focusableDescendants (20, lift 100.0); ariaAttributeBad (17, lift 17.1) | new-issue candidate | |
| aria-allowed-attr | 170 | 30 | ariaAttributeBad | 48% (81) | 87.9 | duplicateID (1, lift 5.5); landmarkConfusion (1, lift 5.5) | map | |
| focus-visible | 167 | 167 | — | 21% (35) | 287.7 | mainNone (48, lift 252.8); skipRepeatedContent (6, lift 191.4) | new-issue candidate | |
| aria-valid-refs | 167 | 36 | — | 22% (36) | 39.8 | activeEmbedding (4, lift 77.5); dialogNoText (1, lift 108.5) | new-issue candidate | |
| heading-order | 153 | 87 | headingLevelSkip | 95% (146) | 313.2 | headingEmpty (2, lift 16.9); headingLength (1, lift 20.4) | map | |
| redundant-role | 135 | 72 | — | 5% (7) | 48.4 | asideNotTop (3, lift 15.0); labelConfusionRisk (4, lift 8.0) | new-issue candidate | |
| landmark-one-main | 133 | 133 | mainNone | 77% (102) | 674.5 | pageLanguage (29, lift 564.3); h1Not1 (44, lift 454.1) | map | |
| redundant-image-alt | 120 | 19 | imageTextRedundant | 69% (83) | 482.0 | ignorable (74, lift 0.9) | map | |
| button-name | 111 | 32 | buttonNoText | 97% (108) | 318.2 | linkNoText (13, lift 11.2); ignorable (90, lift 1.2) | map | |
| focus-not-obscured | 108 | 8 | — | 16% (17) | 51.5 | newTabSurprise (16, lift 8.1); linkConfusionRisk (2, lift 5.0) | new-issue candidate | |
| control-contrast | 103 | 52 | labelConfusionRisk | 57% (59) | 154.0 | labelNot1 (4, lift 390.9); selectNoText (2, lift 293.2) | map | |
| form-label | 88 | 55 | — | 2% (2) | 1029.4 | selectNoText (4, lift 686.3); labelConfusionRisk (66, lift 201.6) | new-issue candidate | |
| redundant-alt-phrase | 87 | 27 | — | 1% (1) | 69.4 | ignorable (85, lift 1.4); contentBeyondLandmarks (7, lift 2.8) | new-issue candidate | |
| listitem-parent | 86 | 7 | listItemOrphan | 45% (39) | 708.3 | ignorable (2, lift 0.0) | map | |
| page-heading-one | 80 | 80 | h1Not1 | 71% (57) | 977.9 | pageTitle (5, lift 1132.3); skipRepeatedContent (10, lift 666.1) | map | |
| pause-stop-hide | 79 | 21 | — | 1% (1) | 11.8 | footerNot1 (1, lift 11.4); contrastAA (16, lift 2.1) | new-issue candidate | |
| aria-label-misuse | 77 | 16 | attributeBad | 95% (73) | 825.8 | ariaAttributeBad (69, lift 165.3); contentBeyondLandmarks (5, lift 2.3) | map | |
| link-in-text-block | 61 | 25 | linkIndication | 57% (35) | 509.6 | linkVaguenessRisk (2, lift 84.9); linkFileName (1, lift 40.1) | map | |
| empty-heading | 47 | 24 | headingEmpty | 100% (47) | 1294.1 | headingLevelSkip (3, lift 20.9); ignorable (36, lift 1.1) | map | |
| area-alt | 47 | 1 | — | 100% (47) | 1927.4 | linkNoText (47, lift 96.0); ignorable (47, lift 1.5) | low support | |
| meta-viewport | 38 | 37 | metaBansZoom | 95% (36) | 1751.4 | — | map | |
| aria-field-name | 38 | 7 | — | 82% (31) | 2383.9 | inputNoText (6, lift 2043.3); controlNoText (6, lift 185.8) | new-issue candidate | |
| media-captions | 38 | 4 | — | 21% (8) | 346.7 | videoNoTranscript (3, lift 255.4); videoNoAudioTrack (3, lift 255.4) | new-issue candidate | |
| scrollable-region-focusable | 32 | 12 | keyboardScroll | 28% (9) | 849.3 | contentBeyondLandmarks (1, lift 1.1) | map | |
| html-lang | 31 | 31 | pageLanguage | 100% (31) | 2588.2 | pageTitle (5, lift 2922.2); mainNone (26, lift 737.6) | map | |
| frame-title | 26 | 18 | iframeTitleBad | 73% (19) | 1085.2 | boxSizeAbsolute (4, lift 5.5); ignorable (19, lift 1.1) | map | |
| meta-refresh | 24 | 24 | refresh | 96% (23) | 3617.2 | — | map | |
| p-as-heading | 24 | 14 | — | 17% (4) | 112.7 | — | new-issue candidate | |
| definition-list | 24 | 1 | — | 100% (24) | 1.5 | — | low support | |
| video-loop-motion | 23 | 23 | videoNoAudioDescription | 83% (19) | 2078.7 | audioNoText (19, lift 1626.8); videoNoTranscript (13, lift 1828.6) | map | |
| list-structure | 20 | 12 | listChild | 95% (19) | 4098.0 | descendantMissing (13, lift 550.3); ignorable (19, lift 1.4) | map | |
| button-type | 17 | 10 | — | 12% (2) | 38.5 | visibleLabelNotInName (3, lift 21.1); ariaAttributeBad (1, lift 10.9) | new-issue candidate | |
| positive-tabindex | 14 | 7 | tabIndexPositive | 100% (14) | 6470.5 | skipRepeatedContent (1, lift 380.6); labelConfusionRisk (4, lift 76.8) | map | |
| reflow | 12 | 12 | h1Not1 | 42% (5) | 571.9 | mainNone (3, lift 219.9); iframeTitleBad (1, lift 123.8) | map | |
| aria-attr-valid | 9 | 4 | ariaAttributeBad | 100% (9) | 184.5 | ignorable (4, lift 0.7) | map | |
| canvas-alt | 8 | 5 | — | 50% (4) | 17.8 | ignorable (3, lift 0.6) | new-issue candidate | |
| no-autofocus | 8 | 7 | — | 25% (2) | 134.0 | labelConfusionRisk (3, lift 100.8); ignorable (8, lift 1.5) | new-issue candidate | |
| bypass-blocks | 6 | 6 | skipRepeatedContent | 100% (6) | 5328.6 | h1Not1 (3, lift 686.3); pageLanguage (2, lift 862.7) | map | |
| document-title | 6 | 6 | pageTitle | 83% (5) | 15097.8 | pageLanguage (5, lift 2156.8); h1Not1 (6, lift 1372.5) | map | |
| aria-required-children | 5 | 4 | — | 20% (1) | 2588.2 | descendantMissing (5, lift 846.6); controlNoText (1, lift 235.3) | new-issue candidate | |
| multiple-labels | 5 | 4 | labelNot1 | 100% (5) | 10065.2 | duplicateID (4, lift 747.1); ariaMissing (1, lift 862.7) | map | |
| autocomplete-valid | 5 | 3 | autocompleteBad | 100% (5) | 15097.8 | ignorable (5, lift 1.5); contrastAA (1, lift 2.1) | map | |
| dialog-name | 4 | 4 | — | 100% (4) | 18117.4 | ariaAttributeBad (1, lift 46.1) | low support | |
| fieldset-legend | 4 | 4 | — | 25% (1) | 2516.3 | controlNoText (1, lift 294.1); duplicateID (1, lift 233.5) | low support | |
| aria-required-parent | 4 | 1 | — | 0% (0) | 0.0 | — | low support | |
| label-for-valid | 3 | 3 | — | 33% (1) | 11.6 | contrastAA (2, lift 7.0); contrastAAA (2, lift 6.9) | low support | |
| table-headers | 3 | 3 | — | 100% (3) | 2264.7 | tableHeaderless (2, lift 1830.0); tabularTableless (2, lift 1776.2) | low support | |
| visual-order-divergence | 3 | 3 | — | 33% (1) | 3.4 | ignorable (1, lift 0.5) | low support | |
| auth-field-obstruction | 3 | 1 | — | 100% (3) | 1.5 | — | low support | |
| composite-widget-name | 2 | 2 | — | 50% (1) | 6470.5 | ariaAttributeBad (2, lift 184.5) | low support | |
| valid-role | 1 | 1 | — | 100% (1) | 536.0 | focusableRole (1, lift 374.3); ignorable (1, lift 1.5) | low support | |

Summary: 70 fired rules — 33 mapping proposals, 26 new-issue candidates, 11 low-support.

Incumbent instances with no tic mapping (top 10 — taxonomy coverage gaps):
- qualWeb:QW-BP30: 807
- ed11y:altURLLinked: 107
- axe:meta-refresh: 24
- ed11y:altMeaningless: 21
- ed11y:altMeaninglessLinked: 12
- axe:aria-tab-name: 1

## Reading notes for the triage pass

- **High-confidence accepts** (semantic match + dominant co-rate + high lift): empty-heading→headingEmpty, button-name→buttonNoText, heading-order→headingLevelSkip, landmark-one-main→mainNone, page-heading-one→h1Not1, image-alt→imageNoText, aria-hidden-focus→focusableHidden, new-window-link→newTabSurprise, document-title→pageTitle, bypass-blocks→skipRepeatedContent, autocomplete-valid→autocompleteBad, multiple-labels→labelNot1, aria-label-misuse→attributeBad, link-in-text-block→linkIndication, listitem-parent→listItemOrphan, redundant-image-alt→imageTextRedundant, color-contrast→contrastAA, color-contrast-enhanced→contrastAAA.
- **Split candidates**: link-name (linkNoText vs imageLinkNoText both co-fire strongly — tic distinguishes text links from image links; pour's one rule covers both); landmark-unique / landmark-top-level (bannerNotTop / mainNotTop / footerNotTop family).
- **Likely genuine pour novelty** (new-issue candidates with no plausible runner-up): text-spacing (1.4.12 — no incumbent equivalent fired anywhere), target-size / target-size-enhanced (2.5.8/2.5.5 — tic appears to lack target-size issues), non-text-contrast (1.4.11), focus-visible, focus-not-obscured (2.4.11), and the redundant-* best-practice family (pour's "overdoing it" rules).
- **Known ranking quirk**: extreme-lift/tiny-support pairs can outscore the right answer when a rule's true match has moderate lift (see form-label, where labelConfusionRisk — 66 elements, lift 202 — is the plausible mapping but a 2-element pair scored higher and then failed thresholds). The runners-up column carries the correction; this is why proposals are review inputs, not auto-accepts.
- **Byproduct — taxonomy coverage gaps** (incumbent rules with no tic home; upstream-filing material): qualWeb QW-BP30 (807 instances), ed11y altURLLinked/altMeaningless/altMeaninglessLinked, axe meta-refresh, axe aria-tab-name.
