# Changelog

## v0.1.0 (2026-10-18)

First release. The code of the stable core comes from the Hypothesizer web app, behaviour unchanged.

**Stable core (`hypocheck`)** — depends only on zod.
- Project model (`schemaVersion: 1`, unchanged), vocabularies, statement and template generation, the ConfBias
  worked example from Bjørn Sætrevik and team's Hypothesizer v0.5 sheet.
- Optional id-generator injection (`idGen`, `sequentialIds()`) wherever variables or hypotheses are created; the
  default generator and id format are unchanged.
- The 18 authoring criteria with their DOI-verified sources, the "pending" (not yet assessable) status,
  `hasEffectBounds` / `predictionBoundsDone`; `assessAuthoring` (with `scoreProject` as an alias).
- Rule-based free-text analysis (`findCandidates`, `specificityLevel`, `splitSentences`, `quoteIsVerbatim`).
- AI task prompts and reply parsers (extract / critique / coach) with an injected `LlmClient`; prompt text
  byte-identical to the app's prompts of version 2026-10-18.1; every result records the prompt id, the SHA-256 of
  the instantiated prompt and the served model. `replayClient` / `recordingClient` for offline tests.
- Markdown export; v0.5-layout limits (`xlsxLossWarnings`).

**Optional entries**: `hypocheck/export-docx` (peer `docx`), `hypocheck/export-xlsx` (peer `exceljs`; xlsx export
and the v0.5 importer).

**Experimental (`hypocheck/experimental`)** — unstable, not validated.
- Evidence-graph interchange format `hypocheck.graph` 0.1.0 (zod schemas, generated JSON Schema in
  `schema/`), `anchorQuote` / `validateAnchors`, `extractLedger` (section-wise chunking, coverage, no field
  defaults), `evaluatePublished` (rule set `published-0.1.0`, rules R1–R7 with caps enforced in code),
  `toPluginIssues` (SciMeto issue shape).

**Known limitations of the experimental evaluator (from a 10-paper development pre-test, 2026-10-18).** On
published papers, rule set `published-0.1.0` produced 9 NOTEs (1 matching a concern two independent annotators
agreed on, 6 false alerts, 1 wrong attribution, 1 unresolved) and missed 5 of 6 agreed in-scope concerns; no WARN
was emitted (caps held). Reproduced defects, to be fixed in 0.2:
- `LABEL_RE` rejects upper-case sub-letters ("H1A", "Hypothesis 1A") and over-matches e.g. "H2 receptor".
- R3 looks for an equivalence/Bayes basis in the whole text including the reference list.
- Section classes are not inherited by numbered/"Study n" subsections, shrinking R1/R2/R3/R5 scan ranges.
- `extractLedger` emits no analysis refs, links or tail direction, so R4 and R7 cannot fire on extracted graphs.
- R3 absence patterns match covariate/robustness sentences and miss "rule out" claims.
- No ligature folding in anchoring; every extracted hypothesis is placed in a single study.
Do not use the experimental evaluator for claims about papers.

