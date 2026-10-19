# hypocheck

Specify scientific hypotheses so they are specific and falsifiable, check them against 18 literature-based
authoring criteria, generate statements, templates and a PCI RR study design table — and, experimentally, record
what a paper or preregistration says about its hypotheses as a source-anchored evidence graph and check it for
reporting inconsistencies.

- **Stable core** (`hypocheck`): project model, criteria, generation, exports, AI task prompts with an injected
  model client. Depends only on `zod`; runs in Node and in browser bundles.
- **Optional entries**: `hypocheck/export-docx` (needs `docx`), `hypocheck/export-xlsx` (needs `exceljs`).
- **Experimental** (`hypocheck/experimental`): evidence-graph format, quote anchoring, ledger extraction,
  published-paper evaluator (rule set `published-0.1.0`), mapping to plugin issues. **Not validated**; see
  [docs/EVALUATOR.md](docs/EVALUATOR.md).

The project model and authoring checks come from the Hypothesizer web app, which grew out of the Hypothesizer v0.5
spreadsheet by Bjørn Sætrevik and team.

## Install

```bash
npm install github:giladfeldman/hypocheck#v0.2.0
# only if you use the Word / Excel exports:
npm install docx exceljs
```

ESM only, Node ≥ 18. The `prepare` script builds `dist/` on install; `dist/` is not committed. `docx` and `exceljs`
are optional peer dependencies: the core entry never imports them, so a browser bundle of `hypocheck` does not pull
them in.

## Quickstart

```js
import { confBiasExample, hypothesisStatements, assessAuthoring, projectMarkdown } from "hypocheck";

const project = confBiasExample();
console.log(hypothesisStatements(project).slice(0, 2).join("\n"));
const { cards } = assessAuthoring(project);
const focal = cards.find((c) => c.label === "H1a");
console.log(focal.label, focal.results.filter((r) => r.status === "fail").map((r) => r.criterion));
console.log(projectMarkdown(project).split("\n")[0]);
```

```js
import { sha256 } from "hypocheck";
import { GRAPH_FORMAT, GRAPH_FORMAT_VERSION, anchorQuote, evaluatePublished, toPluginIssues } from "hypocheck/experimental";

const text = "Introduction\n\nWe test H1 and H2.\n\nResults\n\nH1 was supported. The effect was marginally significant (p = .07), supporting H2.\n\n";
const r = text.indexOf("Results");
const sections = [
  { id: "s1", label: "Introduction", start: 0, end: r },
  { id: "s2", label: "Results", start: r, end: text.length },
];
const graph = {
  format: GRAPH_FORMAT, version: GRAPH_FORMAT_VERSION, createdBy: { name: "quickstart", version: "1" },
  documents: [{ id: "paper", role: "paper", textSha256: sha256(text), extractor: { name: "manual", version: "1" },
    offsetUnit: "utf16", sections, coverage: { status: "complete", readSectionIds: ["s1", "s2"], unreadSectionIds: [] } }],
  studies: [{ id: "study-1", documentIds: ["paper"] }], hypotheses: [], anchors: [],
};
console.log(anchorQuote(text, "H1 was supported.", { documentId: "paper" }).anchors[0].start);
const report = evaluatePublished(graph, { texts: { paper: text } });
for (const issue of toPluginIssues(report)) console.log(issue.severity, issue.title);
```

## Stable core: `hypocheck`

### Project model (zod)

- `ProjectSchema`, `Project` — one study: `context` + `variables` + `hypotheses`, `schemaVersion: 1` (unchanged from
  the app; saved projects keep loading).
- `StudyContextSchema`, `StudyContext`; `VariableSchema`, `Variable`; `HypothesisSchema`, `Hypothesis`;
  `EffectSizeSchema`, `InferenceSchema`, `FalsificationSchema`; `RefSchema`, `Ref` (`"v:<id>"` variable,
  `"h:<id>"` named effect).
- `emptyProject()`, `newVariable(partial, options)`, `newHypothesis(partial, options)`.
- Ids: `newId(prefix)` is the default generator (time + counter + random, the app's format). Pass
  `{ idGen }` (`IdOptions`, `IdGenerator`) to any creating function for deterministic ids, e.g.
  `sequentialIds(start)` → `v1`, `v2`, `h1`, …
- `confBiasExample()` — the worked example from the v0.5 sheet (Bjørn Sætrevik and team).

### Vocabularies

`VARIABLE_ROLES`, `VariableRole`, `VARIABLE_TYPES`, `VariableType`, `ASSOCIATIONS`, `Association`,
`DirectionClass`, `QUALIFICATIONS`, `QualificationId`, `LISTINGS`, `Listing`, `HYPOTHESIS_KINDS`,
`HypothesisKind`, `FUNCTIONAL_FORMS`, `EFFECT_METRICS`, `associationById(id)`; legacy-sheet mappers
`associationFromLegacy(raw)`, `qualificationFromLegacy(raw)`, `kindFromLegacy(raw)`, `listingFromLegacy(raw)`,
`roleFromLegacy(raw)`, `typeFromLegacy(raw)`.

### Generation

`labelHypotheses(hypotheses)` → `Labelled[]` (H1, H1a, A1 auxiliary, MC1 manipulation check, E1 exploratory, U1),
`refName(project, ref)`, `predictionSentence(project, h, tense)`, `statement(project, l)`,
`summarySentence(project)`, `hypothesisStatements(project)`, `variableLists(project)`, `variableDefinition(v)`,
`resultsTemplate(project, l)`, `discussionTemplate(project, l)`, `designTable(project)` → `DesignTableRow[]`
(PCI RR study design table).

### Authoring criteria

- `CRITERIA` (`Criterion[]`, 18 criteria, each with `sources` and a `basis` of `"literature"` or
  `"convention"`), `CRITERION_BY_ID`.
- `assessAuthoring(project)` → `AuthoringAssessment` (`cards: Scorecard[]`, `issues: ProjectIssue[]`).
  `scoreProject` is the same function under the app's name. Authoring only — never apply it to a published paper.
- `checkHypothesis(project, l, all)` → `CheckResult[]`; `checkProject(project)` → `ProjectIssue[]`.
- `Status`: `"pass" | "warn" | "fail" | "na" | "pending"` (`pending` = not yet assessable: the part the
  criterion reads is still empty; it is neither a pass nor a failure).
- `hasEffectBounds(h)` (a SESOI, or both an optimistic and a pessimistic bound) and `predictionBoundsDone(h)`.
- `CITATIONS`, `Citation`, `cite(...ids)`. Every DOI is checked against Crossref by `npm run verify:citations`.

### Sentence parsing and the "ready to use" package

- `parseHypothesisSentence(input)` → `ParseResult`: a bounded, rule-based (no AI) reading of a one-sentence
  prediction into `ParseParts` (`predictor`, `outcome`, `relationship`, `comparison`, `population`), each a
  `TextPart` with the `Span` it came from (`input.slice(start, end) === text`). `ParseStatus` is `"parsed"`,
  `"ambiguous"` (one question to ask; see `Alternative`, `QuestionOption`) or `"unsupported"` with an
  `UnsupportedReason` (`"empty"`, `"question"`, `"compound"`, `"negated"`, `"moderation"`, `"too_long"`,
  `"no_pattern"`); `UNSUPPORTED_MESSAGE` maps each reason to user wording. Direction is set only when explicit
  (`RelationshipPart`, `Direction`).
- `addHypothesisFromParts(project, parts, options?)` commits user-confirmed `ConfirmedParts` into a new project
  (returns `{ project, hypothesisId, reused }`; an existing variable with the same name is reused, see
  `findVariable(project, name)`). Accepts `IdOptions`.
- `hypothesisPackage(project, l)` → `HypothesisPackage` (prediction, population, comparison, measures,
  smallest effect, test, decision rules); `packageText(pkg)`, `projectPackages(project)`,
  `projectPackageText(project)`. Open parts print as `NOT_SPECIFIED` (`"[not specified]"`), never invented.

### Next decisions (no score)

`nextDecisions(project, hypothesisId, limit)` → `NextDecisions` (`next`, `later`, `specified`): the open
criteria of one hypothesis turned into at most `limit` (default 3) concrete `Decision`s, ranked
deterministically by `tier` (1 incomplete claim, 2 comparison/measurement, 3 decision rules, 4 supporting
detail). Each `Decision` has `id` (`DecisionId`), `title`, `detail`, `panel` (`PanelId`), `criteria` and the
worst `status`. `SpecifiedItem`, `SPECIFIED_LABEL`, `PRESENCE_CRITERIA` and `passWording(criterion)` (returns
`label` and an optional `note`) word the criteria that are already met. It only re-reads `checkHypothesis`
results and never changes a status.

### Free text (no AI)

`splitSentences(text)` and `findCandidates(text, max)` → `Candidate[]` with exact offsets;
`specificityLevel(text)` → `Specificity` (0–3; `LEVEL_LABELS`); `quoteIsVerbatim(source, quote)`; `quoteMatch(source, quote)` → `"verbatim" | "shortened" | null` (a quote cut with "..." counts as found only when every piece of 12+ characters occurs in order, each within 800 characters of the previous; extraction items carry `quoteVerified` and `quoteShortened`);
`defaultAccepted(items)` (which extracted items start selected: only verbatim-verified ones).

### AI tasks with an injected model client

The library ships no provider, key or network code. Supply an `LlmClient`:

```ts
interface LlmClient { complete(request: LlmRequest): Promise<LlmResponse> }
interface LlmRequest {
  system?: string; prompt: string; promptId: string; promptSha256: string;
  maxTokens?: number; responseFormat?: "json" | "text";
  accept?: (text: string) => boolean;   // the library's parser, so a pooled host can rotate on unusable replies
  signal?: AbortSignal;
}
interface LlmResponse { text: string; servedModel?: string | null; finishReason?: string | null;
  usage?: Record<string, number | string | null> | null; requestId?: string | null }
```

- `aiExtract(document, client, options)` (its result also carries `focus`), `aiCritique(project, h, results, client, options)`,
  `aiCoach(project, step, client, options)`, `aiParts(sentence, client, options)` → `{ parts: AiParts }`,
  `aiFill(project, h, fields, client, options)` → `{ suggestions: FillSuggestion[] }` → `AiTaskResult` — `{ ok: true, model, provenance, ... }` or
  `{ ok: false, reason: "unusable_reply" | "client_error", error?, provenance }`. `AiTaskOptions` carries `signal`.
- `LlmProvenance` = `{ promptId, promptSha256, servedModel, libraryVersion }` on every result.
- Long documents: `stripReferences(text)` → `StrippedReferences` `{ text, removedChars }` removes every reference
  list in the second half of a document (up to an appendix/supplement heading); `focusDocument(document, budgetChars)`
  → `FocusedDocument` `{ text, complete, includedChars, totalChars, passages, referencesRemovedChars }` keeps the
  opening, labelled hypotheses, hypothesis sections, hypothesis-language sentences and the end of the introduction,
  joined by `FOCUS_GAP` (`"
[…]
"`), each passage an exact slice so quotes stay verbatim.
- Prompts and parsers: `extractionPrompt(document, options)` → `{ system, prompt, focus }` (the document is reduced
  to `maxChars`, default `AI_DOCUMENT_CHARS` = 18,000, by `focusDocument`; never cut at the start), `parseExtraction(text)` → `Extracted`, `normalizeAssociation(raw)` (vocabulary id, or a single direction word such as "weaker" mapped; a phrase stays `""`),
  `extractionToProject(source, ex, options)` → `{ project, items: ExtractedItem[] }`, `critiquePrompt(project, h, results)`, `parseCritique(text)` → `Critique`, `MAX_SUGGESTIONS`, `describeHypothesis(project, h)`,
  `coachPrompt(project, step)`, `parseCoach(text)`, `extractJsonObject(text)`, `fence(text)`.
- One sentence into parts (the fallback when `parseHypothesisSentence` cannot read it): `partsPrompt(sentence)`,
  `parseParts(text, sentence)` → `AiParts` `{ predictor, outcome, association, comparison, population }`; a
  comparison or population is kept only when the sentence names it.
- Suggested answers for open fields: `FILL_FIELDS` / `FillField` (`association`, `population`, `first_measure`,
  `second_measure`, `comparison`, `theory`, `mechanism`, `supports`, `falsifies`, `test` — never a smallest effect of
  interest or alpha), `fillPrompt(project, h, fields)`, `parseFill(text)` → `FillSuggestion[]` `{ field, value, why }`.
- `PROMPT_VERSION` (`2026-10-19.1`) and `PROMPT_IDS` (`hypothesizer-extract@…`, `hypothesizer-critique@…`,
  `hypothesizer-coach@…`, `hypothesizer-parts@…`, `hypothesizer-fill@…`). The prompt text is byte-identical to the Hypothesizer app's published prompt files
  (checked by `tests/core.test.ts`), so model-routing measurements made with those files stay valid.
- `promptSha256(system, prompt)` hashes `renderPromptText(system, prompt)` =
  `"# SYSTEM\n" + system + "\n# USER\n" + prompt + "\n"` — the published prompt-file layout without its version line.
- Offline testing: `replayClient(recordings, options)` answers from `LlmRecording[]` (by `promptSha256`, or in
  order by `promptId` with `matchBy: "promptId"`) and throws on a request it has no recording for;
  `recordingClient(inner)` wraps a live client and keeps its exchanges.

### Exports and utilities

- `projectMarkdown(project)` — Markdown with statements, variables, the design table and templates.
- `xlsxLossWarnings(project)` and the v0.5 layout constants `XLSX_VARIABLE_FIRST_ROW`, `XLSX_HYPOTHESIS_FIRST_ROW`,
  `XLSX_MAX_VARIABLES`, `XLSX_MAX_HYPOTHESES` (pure; also exported by `hypocheck/export-xlsx`).
- `sha256(input)` (pure TypeScript, no `node:crypto`), `canonicalJson(value)` (sorted keys), `LIBRARY_VERSION`.

## Optional entries

```ts
import { projectDocx } from "hypocheck/export-docx";                       // needs `docx`
import { projectXlsx, importLegacyXlsx, stripQuotes } from "hypocheck/export-xlsx"; // needs `exceljs`
```

- `projectDocx(project)` → `Buffer` (Word, landscape, with the design table).
- `projectXlsx(project)` → `Buffer` in the v0.5 layout plus a "Hypothesizer details" tab. Not a complete backup
  (see `xlsxLossWarnings`); the project JSON is.
- `importLegacyXlsx(data, options)` → `ImportReport` (`{ project, warnings }`) for v0.5 sheets and this library's
  own exports; `stripQuotes(s)`.

## Experimental: `hypocheck/experimental`

Unstable (may change in any 0.x release) and **not validated**. It is a source-grounded consistency checker on a
hypothesis ledger, not a judge of whether hypotheses or papers are good. Design and limits:
[docs/EVALUATOR.md](docs/EVALUATOR.md); type reference: [docs/API.md](docs/API.md).

### Evidence graph format (`format: "hypocheck.graph"`, `version: "0.1.0"`)

- `GRAPH_FORMAT`, `GRAPH_FORMAT_VERSION`, `GraphSchema` / `EvidenceGraph`, `parseGraph(input)`,
  `checkGraphReferences(graph)` (dangling ids zod cannot see), `graphJsonSchema()` (JSON Schema 2020-12 generated
  with `z.toJSONSchema`; a copy is shipped as `hypocheck/graph.schema.json`).
- Documents: `GraphDocumentSchema` / `GraphDocument` (`textSha256`, `extractor`, `offsetUnit: "utf16"`,
  `sections`, `coverage`), `DocumentRoleSchema` / `DocumentRole`, `SectionSchema` / `Section`,
  `CanonicalSectionSchema` / `CanonicalSection`, `ExtractorSchema` / `Extractor`, `CoverageSchema` / `Coverage`.
- `StudySchema` / `Study`.
- Hypotheses: `HypothesisNodeSchema` / `HypothesisNode` (occurrence `id`, optional `scientificId`, author
  `labels` namespaced by study and document, exact `statement`, `components` + `logic`, `fields`, `provenance`),
  `HypothesisLabelSchema` / `HypothesisLabel`, `ComponentSchema` / `Component`, `HypothesisFieldsSchema` /
  `HypothesisFields`, `occurrenceId(textSha256, start, end, componentPath)`.
- Evidence states: `evidenceValue(value)` builds the zod union; `EvidenceValue<T>` is one of `observed`,
  `inferred`, `not_located`, `not_supplied`, `conflicting`, `not_applicable` (`EvidenceState`);
  `EvidenceAlternativeSchema`. Field value schemas: `DirectionSchema` / `Direction`, `SidednessSchema` /
  `Sidedness`, `HypothesisStatusSchema` / `HypothesisStatus`, `ResultDirectionSchema` / `ResultDirection`.
- Anchors: `AnchorSchema` / `Anchor` (`documentId`, `start`, `end` zero-based end-exclusive, `exact`, `prefix`,
  `suffix`, `sectionId`, `page`, `matchMethod`, `normalization`), `MatchMethodSchema` / `MatchMethod`,
  `NormalizationStepSchema` / `NormalizationStep`.
- `DecisionRuleSchema` / `DecisionRule` (the authors' own rules only: `source: "author"`),
  `AnalysisRefSchema` / `AnalysisRef` with `NamespacedIdSchema` (host ids such as `stats:row:12` or
  `tables:T1:row:3`), `LinkSchema` / `Link`, `LinkRelationSchema` / `LinkRelation`, `ReviewStatusSchema` /
  `ReviewStatus`, `ProvenanceSchema` / `Provenance`.
- Assessments: `AssessmentSchema` / `Assessment`, `PremiseSchema` / `Premise`, `VerdictSchema` / `Verdict`
  (`OK | NOTE | WARN | FLAG | NOT_ASSESSABLE`; applicability `not_applicable` is separate and has a `null` verdict).

### Anchoring

- `anchorQuote(text, quote, options)` → `AnchorQuoteResult` (`unique` | `ambiguous` | `not_found`). Exact matches
  first; otherwise a normalized match (`normalizeWithMap(text, steps)` with `ALL_NORMALIZATION_STEPS`), recorded on
  the anchor. Repeats are disambiguated by `prefix` / `suffix` (`AnchorQuoteOptions`); if that fails, all candidates
  come back as `ambiguous`.
- `validateAnchors(anchors, texts, options)` → `ValidateAnchorsResult` with `AnchorProblem` /
  `AnchorProblemCode` (`text_hash_mismatch`, `exact_mismatch`, `out_of_range`, …).
- `makeAnchor(text, documentId, start, end, options)`, `anchorId(documentId, start, end)`,
  `sectionAt(sections, start)`.

### Deterministic text scanners

Pure, offset-exact, each with positive and hard-negative tests: `findTrendLanguage(text)` (`TREND_PATTERNS`),
`findSupportLanguage(sentence)`, `findNonsignificance(text)` (`NONSIGNIFICANCE_PATTERNS`),
`findAbsenceClaims(text)` (`ABSENCE_CLAIM_PATTERNS`), `findRejectionClaims(text)` (`REJECTION_PATTERNS`),
`findAbsenceBasis(text)` (`ABSENCE_BASIS_PATTERNS`), `findStatedSidedness(text)` → `SidednessMatch[]`,
`labelInventory(text, sections)` → `LabelOccurrence[]`, `findHypothesisCountClaims(text)` → `CountClaim[]`,
`findSubgroupSignificance(text)` (`SUBGROUP_PATTERNS`), `INTERACTION_TEST_RE`, `MODERATION_HYPOTHESIS_RE`;
section helpers `canonicalSection(label)`, `sectionClass(section)`, `rangesFor(text, sections, classes)`,
`sentencesIn(text, ranges)` → `SentenceSpan[]`. Matches are `TextMatch`.

### Ledger extraction

`extractLedger(bundle, llm, options)` → `LedgerResult` (`graph`, `calls: LedgerCall[]`, `unanchored: UnanchoredItem[]`, `warnings`). Input `DocumentBundle` of `BundleDocument`s; `ExtractLedgerOptions.budgetChars` is
required (the host sets the budget; there is no fixed cut-off). `planChunks(doc, budgetChars, skipSectionClasses)`
→ `LedgerChunk[]`; `ledgerPrompt(chunkText)` (the app's extraction prompt text over one chunk, recorded as
`LEDGER_PROMPT_ID`); `CONFIRMATORY_STATED_RE` (status "confirmatory" is recorded only when the text says so).

### Evaluation and plugin mapping

- `evaluatePublished(graphInput, options)` → `EvaluationReport` (`formatVersion`, `libraryVersion`,
  `ruleSetVersion`, `graphFormatVersion`, `inputHashes`, `assessments`, `summary`). `EvaluateOptions` takes the
  document `texts` and optional `rules`; `DocumentInputHash` records whether each text was supplied and matched.
- `RULES` (`RuleDefinition[]`), `RULE_BY_ID`, `RuleId` (`R1` … `R7`), `RULE_SET_VERSION` (`published-0.1.0`),
  `REPORT_FORMAT`, `REPORT_FORMAT_VERSION`, `applyCaps(raw, ctx)` with `CapContext`.
- `toPluginIssues(report, policy)` → `PluginIssue[]` (`PluginIssueLocation`, `PluginPolicy`): NOTE → `info` with
  `isFinding: false`, WARN → `warning`, never `error`; one issue per concern; OK / NOT_ASSESSABLE / not applicable
  only in one summary item; suggestions are `manual` instructions, never replacement text.

## Stable vs experimental

| Part | Status |
|---|---|
| Project model, `schemaVersion: 1` | Stable. Breaking changes need a major version and a migration. |
| Criteria, generation, Markdown/DOCX/XLSX, v0.5 importer | Stable (behaviour identical to the app at the time of extraction). |
| AI task prompts and parsers, `LlmClient` | Stable interface; prompt text changes only with a new `PROMPT_VERSION`. |
| Evidence graph, anchoring, ledger, evaluator, plugin mapping | Experimental, unvalidated, may change in any 0.x release. |

## Crosswalk (conceptual alignment only — not a compatibility claim)

**scienceverse** (Lakens & DeBruine, 2021, https://doi.org/10.1177/2515245920970949) describes studies whose
hypotheses are linked to analyses and to criteria that decide corroboration and falsification.

| scienceverse concept | hypocheck graph |
|---|---|
| study | `Study` |
| hypothesis (id, description) | `HypothesisNode` (occurrence `id`, `scientificId`, `statement`, `labels`) |
| criteria (conditions on analysis results) | `DecisionRule` (authors' wording; no executable expression in 0.1.0) |
| corroboration / falsification evaluation | `Link` with `supports` / `contradicts` / `inconclusive` and `outcomeBasis` |
| analysis | `AnalysisRef` (namespaced id of an analysis held by another tool) |

The scienceverse JSON schema was not checked for this release; no import or export is offered.

**W3C Web Annotation Data Model** (https://www.w3.org/TR/annotation-model/):

| W3C selector | hypocheck `Anchor` |
|---|---|
| TextQuoteSelector `exact`, `prefix`, `suffix` | `exact`, `prefix`, `suffix` |
| TextPositionSelector `start`, `end` | `start`, `end` (UTF-16 code units, zero-based, end-exclusive, against the text whose hash is `textSha256`) |
| source / target document | `documentId` → `GraphDocument` |

W3C positions count characters of the document's text; hypocheck counts UTF-16 code units of one specific
extracted text. Convert explicitly; do not exchange offsets between different text extractions.

## Development

```bash
npm test                 # vitest
npx tsc --noEmit         # typecheck sources and tests
npm run build            # dist/
npm run docs:check       # every public export documented, versions agree, quickstart runs
npm run schema:write     # regenerate schema/ after a graph-format change (after build)
npm run verify:citations # every DOI in CITATIONS against Crossref (network)
```

The ConfBias golden tests run against the bundled example through an xlsx round trip. To run them against the
original v0.5 sheet, which is not distributed here, set `HYPOCHECK_CONFBIAS_XLSX` to its path.

## License and credits

MIT © Gilad Feldman. The project model, criteria and generator come from the Hypothesizer web app; the concept and
the ConfBias example come from the Hypothesizer v0.5 spreadsheet by Bjørn Sætrevik and team.
