# Changelog

## v0.3.0 (2026-10-23)

**Added**
- `dissonanceExample()`: the current worked example from Bjørn Sætrevik and team's v0.52 sheet (cognitive
  dissonance and attitude change). `confBiasExample()` stays, and the golden tests still use it.
- `importLegacyXlsx` reads the newer (2026) Hypothesizer template: the "Describe variables" tab with its rows
  below the "Variable name:" header, the "Effect size (optional)" column (read into `effectSize.optimistic`, the
  effect expected if the theory is right) and the hypothesis type found by its header. `associationFromLegacy`
  accepts "associated with increased/decreased". The v0.5 layout reads as before.

## v0.2.0 (2026-10-19)

**Changed**
- `extractionPrompt` no longer sends only the first `AI_DOCUMENT_CHARS` characters of a document. The reference list
  is removed and a longer document is reduced by `focusDocument` to its opening, labelled hypotheses, hypothesis
  sections, hypothesis-language sentences and the end of the introduction, so hypotheses stated late in a long
  paper reach the model. `AI_DOCUMENT_CHARS` is now 18,000 (a 30,000-character prompt exceeded Groq's 8,000
  tokens-per-minute limit). The return value adds `focus`; `aiExtract` results carry it too.
- Extraction prompt: quotes must be complete (never shortened with "..."), variable names in the document's words;
  a group or condition difference is structured with the group as the first variable and the
  other group as the comparison, never as the outcome. Rule-based hints are capped at 20 sentences of 300 characters.
  `PROMPT_VERSION` 2026-10-19.1.
- `parseHypothesisSentence` reads "X who … perform/fare better on Y" (ambiguous until the direction is chosen).

**Added**
- `stripReferences`, `focusDocument`, `FOCUS_GAP` (long-document handling).
- `quoteMatch`: a model's quote shortened with "..." is found when all its pieces occur in order, close together;
  `ExtractedItem.quoteShortened` marks it (`quoteVerified` is true for it). Models shortened 8 of 10 quotes in a
  2026-10-19 run despite the prompt, which used to show real quotes as "not found".
- `partsPrompt` / `parseParts` / `aiParts`: AI reading of one sentence into parts (a comparison or population only
  when the sentence names it).
- `fillPrompt` / `parseFill` / `aiFill` and `FILL_FIELDS`: suggested answers for a hypothesis's open fields; never a
  smallest effect of interest or alpha (the prompt says so, and `parseFill` drops a supports/falsifies value that states
  alpha, a p threshold, a smallest effect of interest or an effect-size number; `[SESOI]` placeholders are kept).
- `focusDocument` never returns more than `budgetChars` (overlapping passages were counted twice, overshooting by up to ~1.5%).

## v0.1.1 (2026-10-18)

**Fixed**
- AI reply parsers (`parseExtraction`, `parseCritique`) rejected an item that OMITTED a nullable key (in zod 4 a
  union containing `z.undefined()` still rejects a missing key), so terse model replies silently lost hypotheses.
  A missing key is now read as empty.
- `splitSentences` / `findCandidates`: a line that starts with a hypothesis label (`H2:`, `Hypothesis 2:`) now
  starts a new sentence even when the previous line has no final period (PDF line wraps drop it); before, H1 and
  H2 merged into one candidate.
  The label must be followed by a colon and a capital, digit or quote (`H2: We predict`), so a wrapped
  cross-reference such as `(see` / `H1) and ...` is not split; lowercase `h2:` and `HYPOTHESIS 2:` match too.
- The "ready to use" package: a value with line breaks is collapsed to one line; the Markdown export uses a code
  fence longer than any backtick run in the text; Markdown and Word omit the "Hypotheses, ready to use" heading
  for a project with no hypotheses.

**Added (stable core, moved from the Hypothesizer app, behaviour unchanged)**
- `parseHypothesisSentence`: bounded rule-based reading of a one-sentence prediction into parts with spans.
- `addHypothesisFromParts` / `findVariable`: commit confirmed parts into a project (accepts `IdOptions`).
- `hypothesisPackage` / `packageText` / `projectPackages` / `projectPackageText`: the "ready to use" package with
  `[not specified]` for open parts.
- `nextDecisions` / `passWording`: the top-3 ranked next decisions per hypothesis (no score).

**Changed**
- Every entry in `exports` also has a `default` condition, so CommonJS loaders (Playwright, Jest, ts-node) on
  Node versions with `require(esm)` can load the package; `import` resolution is unchanged.
- Markdown and Word exports now open with "Hypotheses, ready to use" (one package per hypothesis), followed by
  "Hypothesis statements" (previously "Hypotheses").

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

