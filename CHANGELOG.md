# Changelog

## v0.1.0 (unreleased — awaiting owner approval before tagging)

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
