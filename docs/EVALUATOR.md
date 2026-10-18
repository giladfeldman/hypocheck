# The published-paper evaluator (experimental)

Rule set `published-0.1.0`, in `hypocheck/experimental`. **Not validated.** This file records the design decisions
behind it; they come from an independent review of the design by two AI models from different providers
(2026-10-18), adjudicated by the author.

## What it is, and what it is not

- A **source-grounded consistency checker on a hypothesis ledger**: it reconstructs the stated predictions, their
  tests and conclusions, and reports specific, quoted inconsistencies together with the limits of each check.
- **Not** a judge of "good" or "bad" hypotheses, and not a detector of questionable research practices. Rates
  computed with it may only ever describe validated, operationally defined reporting inconsistencies in a stated
  population of documents.
- The 18 **authoring** criteria are never applied to published papers: a missing SESOI, mechanism, derivation,
  theory at stake, auxiliary assumptions or sampling justification in a text is not evidence that the study lacked
  them. The two rule sets share types only.

## Evidence states and verdicts

- Every graph field is an `EvidenceValue`: `observed`, `inferred`, `not_located`, `not_supplied`, `conflicting`
  or `not_applicable` — never an empty string standing for "not found".
- Verdicts: `OK` (the rule could be assessed and its specific concern was not found — this certifies nothing else),
  `NOTE`, `WARN`, `FLAG`, `NOT_ASSESSABLE` (a premise is unresolved). Applicability `not_applicable` is separate and
  carries a `null` verdict; neither it nor `NOT_ASSESSABLE` ever becomes `OK`.

## The premise rule (enforced in code)

1. No `NOTE`/`WARN` without premises; every premise is an anchor that re-slices against the supplied text, whose
   hash must match the document's `textSha256`. Otherwise the verdict becomes `NOT_ASSESSABLE`.
2. A premise proposed by a model (or an `inferred` field) caps the verdict at `NOTE`. The model proposes spans;
   rules decide; provenance travels with every finding. No self-reported model confidence is used or shown.
3. Cross-document rules cap at `NOTE` unless every link they use is `human-confirmed`.
4. No rule may emit `FLAG` in 0.x. Adapters never map anything to `error` in 0.x.
5. R2 and R3 on the same claim are one user-facing concern (shared `groupId`).

## Rules

| id | name | decides | cap until validated | not assessable when |
|---|---|---|---|---|
| R1 | `ledger_consistency` | deterministic label inventory per section; ledger labels | NOTE; WARN only for an explicit count contradiction | no results section; no labels (unlabelled prose) |
| R2 | `nonsignificance_as_support` | deterministic: a sentence reports non-significance and concludes absence or rejection, with no equivalence / interval / Bayes basis in it | NOTE | no text supplied |
| R3 | `absence_claim_basis` | deterministic: an absence claim, with no basis located in any supplied document | NOTE | a document's text was not supplied, or referenced material is unavailable |
| R4 | `direction_test_alignment` | graph fields: directional prediction vs stated tail, or an opposite-direction result linked as support | NOTE; WARN for an explicit contradiction with non-model premises | direction unresolved; sidedness unstated and no result linked (unstated sidedness is not an error; a directional prediction tested two-sided is OK) |
| R5 | `trend_language` | deterministic: "marginally significant" / "trend toward significance" in a clause that claims support | NOTE | no text supplied |
| R6 | `explicit_mismatch` | a moderation hypothesis in the ledger + "significant in A but not in B" with no test of the difference in the paragraph | NOTE | no ledger for the document |
| R7 | `prereg_delta` | correspondence links + fields: differences in direction, outcome, predictor, status, decision rule, SESOI, test (disclosed or not) | NOTE | no correspondence links, or no field established on both sides |

Deferred to research mode: vagueness and ambiguity, compound logic, causal-claim gaps, exploratory-as-confirmatory,
non-constraining decision rules. Dropped as published-paper findings: missing comparison, missing SESOI, missing
mechanism or derivation.

## Extraction requirements (met by `extractLedger`)

Anchors with offsets, exact quote and context; stable occurrence ids (no randomness); provenance with the served
model and the SHA-256 of the instantiated prompt; section-wise chunking under a host budget instead of a fixed
cut-off; coverage of what was read; no default "confirmatory"; expected effect kept apart from the SESOI; repeated
proposals of one span merged with a warning.

## Validation before anything adverse is shown to third parties

- Known-good and rule-specific negative cases first; then a codebook and an external gold set annotated blind by two
  people with an adjudicator; per-rule precision gates on a locked holdout; pre-registered.
- Proposed gates (final numbers belong in the validation preregistration): for autonomous WARN shown to third
  parties, observed precision ≥ .98 with a lower bound ≥ .95; for WARN shown to authors about their own manuscript,
  a Wilson lower bound ≥ .85 (NOTE ≥ .70).
- The first publication should be an instrument-validation paper, not a prevalence claim. A small pre-test is
  instrument debugging, not evidence about paper quality: frozen selection, reference ledger built blind, repeated
  model runs, every output adjudicated (true concern, useful clarification, false alert, wrong attribution,
  extraction failure, missing-source limitation, unresolved), denominators everywhere, no scores or rankings, right
  of reply. "No confirmed defects" is an acceptable outcome.
- First deployment: private and author-facing (an author checking their own manuscript), not public audits.

## Literature

Rule sources cite only DOIs verified against Crossref (`npm run verify:citations`): van den Akker et al. 2023,
Bakker et al. 2020, Lakens, Scheel & Isager 2018, Lakens & DeBruine 2021, Meehl 1967. Further sources suggested in
the design review (e.g. on equivalence testing, Bayes factors, the difference between significant and
non-significant results, HARKing) are added only after they pass the same check.
