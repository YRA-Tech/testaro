# Stage-3b triage draft — pour (for human review)

Drafted 2026-09-01 by Claude from `stage3b-mapping-proposals.md` + the reading notes. Every
verdict below is a **draft for Jeff's accept/override** — semantic judgment calls are marked
⚠️ where the co-occurrence evidence and the rule semantics disagree (the known ranking quirk).
Review workflow: scan the ⚠️ rows first (9 of them), then rubber-stamp or override the rest.
Accepted verdicts become tic entries (initial `quality: 1`) in the next tic version.

## A. Mapping proposals — draft ACCEPT as proposed (24)

The 18 high-confidence accepts from the reading notes, plus 6 where semantics and evidence
agree cleanly:

| Pour rule | tic issue | Note |
| --- | --- | --- |
| empty-heading | headingEmpty | 100% co-rate |
| button-name | buttonNoText | 97% |
| heading-order | headingLevelSkip | 95% |
| landmark-one-main | mainNone | 77% |
| page-heading-one | h1Not1 | 71% |
| image-alt | imageNoText | 67% |
| aria-hidden-focus | focusableHidden | 88% |
| new-window-link | newTabSurprise | 63% |
| document-title | pageTitle | 83% |
| bypass-blocks | skipRepeatedContent | 100% |
| autocomplete-valid | autocompleteBad | 100% |
| multiple-labels | labelNot1 | 100% |
| aria-label-misuse | attributeBad | 95% |
| link-in-text-block | linkIndication | 57% |
| listitem-parent | listItemOrphan | 45%, no plausible rival |
| redundant-image-alt | imageTextRedundant | 69% |
| color-contrast | contrastAA | 49% — plus contrastRisk co-fire is expected (bands) |
| color-contrast-enhanced | contrastAAA | 43% |
| aria-allowed-attr | ariaAttributeBad | 48%, semantic exact |
| meta-viewport | metaBansZoom | 95%, semantic exact |
| scrollable-region-focusable | keyboardScroll | 28% co-rate but semantic exact — incumbents fire rarely |
| html-lang | pageLanguage | 100% |
| frame-title | iframeTitleBad | 73% |
| meta-refresh | refresh | 96% — also fills the axe:meta-refresh coverage gap |
| list-structure | listChild | 95% |
| aria-attr-valid | ariaAttributeBad | 100% (9 el) |
| positive-tabindex | tabIndexPositive | 100% |

(27 rows — three of the "33 proposals" move to §B/§C below instead.)

## B. Mapping proposals — draft SPLIT (3)

| Pour rule | Draft | Rationale |
| --- | --- | --- |
| link-name | **split → imageLinkNoText / linkNoText** by flagged-element content (contains img/svg → imageLinkNoText, else linkNoText) | Both co-fire strongly (60% / 509-element runner-up); tic distinguishes text links from image links, pour's one rule covers both. Split at mapping time on the instance's element, not the rule. |
| landmark-top-level | **split → bannerNotTop / mainNotTop / footerNotTop / asideNotTop** by landmark role | The tic *NotTop family is per-landmark; pour's one rule covers all. Runner-up evidence shows exactly this family. |
| landmark-unique | ⚠️ **remap → landmarkConfusion** | Proposed bannerNotTop (27%) is a co-occurrence artifact — landmark-unique is about *duplicate/undifferentiated* landmarks, which is landmarkConfusion's semantics (91-element runner-up, lift 177). |

## C. Mapping proposals — draft REJECT the proposed issue, re-disposition (3) — all ⚠️

| Pour rule | Proposed (rejected) | Draft disposition | Rationale |
| --- | --- | --- | --- |
| video-loop-motion | videoNoAudioDescription (83%) | **new issue** `motionNoControl` (2.2.2), shared with pause-stop-hide | Rule is about looping/auto-playing motion, not audio description — co-occurrence artifact (pages with video have both defects). |
| reflow | h1Not1 (42%) | **new issue** `reflowBroken` (1.4.10) | Semantic nonsense as a mapping; 1.4.10 has no incumbent coverage — this is novelty, mis-filed by base-rate. |
| control-contrast | labelConfusionRisk (57%) | **fold into** the `nonTextContrast` new issue (1.4.11) with non-text-contrast | 1.4.11 control contrast ≠ label confusion; co-occurrence artifact. |

## D. New-issue candidates — draft REMAP to an existing tic issue instead (8) — all ⚠️ except where noted

The ranking quirk in reverse: the right mapping existed but lost on lift/threshold.

| Pour rule | Draft map | Rationale |
| --- | --- | --- |
| region | contentBeyondLandmarks | Semantic exact; 722-element runner-up (lift 3.1) lost on co-rate only because region fires far more broadly than the incumbent. |
| svg-img-alt | svgImageNoText | Semantic exact; incumbent fires so rarely (1 element) the co-rate is meaningless. |
| nested-interactive | focusableDescendants | Semantic exact (interactive inside interactive), lift 100. |
| aria-required-children | descendantMissing | Semantic exact (role's required owned children absent), lift 847. |
| aria-field-name | inputNoText | 82% co-rate, lift 2043 — likely fell out of "proposed" on a threshold technicality. Not ⚠️: evidence and semantics agree. |
| link-text-generic (+ -only) | linkVaguenessRisk | "Click here"-class generic text is exactly linkVaguenessRisk; runner-up linkTextsSame is a different defect (identical texts, different targets). Map both variants to the same issue; instance dedup absorbs the -only subset. This is pour's ACT sole-detector rule (aizyf1) — do not lose it. |
| form-label | labelConfusionRisk | Per the reading notes: the 66-element, lift-202 runner-up is the plausible mapping; the 2-element top pair was the quirk example. |
| media-captions | ⚠️ videoNoTranscript *or* new `mediaNoCaptions` (1.2.2) | Runner-up is close but captions ≠ transcript; Jeff's call whether tic's existing media family covers 1.2.2 or needs the new issue. |

## E. New-issue candidates — draft CONFIRM as genuinely new tic issues (11 rules → 8 issues)

The novelty pour was screened for. Suggested issue IDs follow tic naming style:

| New tic issue | Pour rule(s) | WCAG | Evidence |
| --- | --- | --- | --- |
| textSpacingRigid | text-spacing | 1.4.12 | No incumbent equivalent fired anywhere (580 el / 61 pages) |
| targetSmall | target-size | 2.5.8 AA | tic has no target-size issues (678 el) |
| targetSmallEnhanced | target-size-enhanced | 2.5.5 AAA | Mirror the contrastAA/AAA banding pattern (8,992 el — volume driver, watch quality) |
| nonTextContrast | non-text-contrast, control-contrast | 1.4.11 | No incumbent; control-contrast folded in from §C |
| focusIndicatorMissing | focus-visible | 2.4.7 | 167 pages — page-level rule |
| focusObscured | focus-not-obscured | 2.4.11 | New-in-2.2 criterion, no incumbent |
| motionNoControl | pause-stop-hide, video-loop-motion | 2.2.2 | Both halves of the auto-playing/looping motion defect |
| reflowBroken | reflow | 1.4.10 | From §C |
| pseudoHeading | p-as-heading | 1.3.1 | Visual heading not marked up; no incumbent fired |
| canvasNoText | canvas-alt | 1.1.1 | Canvas is not an img; imageNoText would blur element semantics |
| ariaRedundant | redundant-aria, redundant-aria-label, redundant-tabindex, redundant-role | best practice | Pour's "overdoing it" family as one issue, `quality: 1`; per-rule granularity preserved in instances |

Also: redundant-alt-phrase → new issue `altPhraseRedundant`, and note it likely also homes
the unmapped incumbents ed11y:altMeaningless/altMeaninglessLinked (kills two coverage-gap
birds). aria-valid-refs → new issue `ariaRefBroken` (broken ID references) unless Jeff reads
tic's ariaMissing as covering it.

## F. New-issue candidates — draft QUALITY-0 / park (2)

| Pour rule | Draft | Rationale |
| --- | --- | --- |
| button-type | quality-0 | Implicit-submit is a behavior bug more than an a11y defect; weak evidence (17 el) |
| no-autofocus | quality-0 | Best-practice; genuine debate whether autofocus is a defect at all; 8 el |

## G. Low-support (11) — draft: park all except three semantic gifts

Park (insufficient evidence, revisit if Stage 4 surfaces them): definition-list,
aria-required-parent, label-for-valid, visual-order-divergence, auth-field-obstruction,
composite-widget-name, valid-role, fieldset-legend.

Map now despite low support (semantics are exact and unambiguous):

| Pour rule | tic issue | Note |
| --- | --- | --- |
| area-alt | linkNoText | Image-map areas are links; 100% co-rate, 47 el (one page) |
| dialog-name | dialogNoText | 100% co-rate, semantic exact |
| table-headers | tableHeaderless | Runner-up is semantically exact |

## Tally

- 24 accepts + 3 splits + 8 remaps + 3 low-support maps = **38 mapped pour rules**
- 13 rules → **~13 new tic issues** (8 novel families incl. multi-rule groupings)
- 2 quality-0, 8 parked
- ⚠️ rows needing real human judgment: **9** (landmark-unique, the three §C rejects,
  region/svg-img-alt/nested-interactive/aria-required-children remaps if the co-rate
  bothers you, media-captions)

## After sign-off

1. Author tic entries (next tic version) in the testilo fork: mapped rules at `quality: 1`;
   new issues with WCAG + weight; splits implemented in the mapping layer per §B.
2. Re-run the evaluation slice as the Stage-4 `study_runs` row with mappings live
   (this is also the app-tier load-baseline measured window).
3. Byproduct filings: taxonomy coverage gaps (qualWeb QW-BP30 × 807, ed11y alt* family,
   axe meta-refresh → homed by the §A/§E work above), pour FP classes with rates
   (fp-triage-2026-08-22.md).
