# Type reference

Condensed declarations of the public types (the `.d.ts` files in `dist/` are authoritative). Zod schemas named
`XSchema` validate the type `X`.

## Core (`hypocheck`)

```ts
// Project model (zod-inferred; every string field defaults to "")
type Variable = { id: string; name: string; role: string; type: string; description: string; operationalization: string };
type Hypothesis = {
  id: string; theory: string; mechanism: string; effectName: string;
  listing: "main" | "subset" | "unlisted";
  first: Ref; association: string; second: Ref; qualification: string; qualifier: Ref; kind: string;
  derivation: string; theoryAtStake: string; population: string; samplingPlan: string; functionalForm: string;
  effectSize: { metric: string; sesoi: string; optimistic: string; pessimistic: string; justification: string };
  inference: { test: string; alpha: string; sided: "" | "one" | "two"; correction: string; bayes: string };
  falsification: { supports: string; falsifies: string; inconclusive: string };
  auxiliaryAssumptions: string[]; notes: string;
};
type StudyContext = { title; researchQuestion; phenomenon; population; discipline; design; samplingPlan; dag: string };
type Project = { schemaVersion: 1; context: StudyContext; variables: Variable[]; hypotheses: Hypothesis[] };
type IdGenerator = (prefix: string) => string;   // prefix "v" or "h"
interface IdOptions { idGen?: IdGenerator }

// Vocabularies
type DirectionClass = "positive" | "negative" | "nondirectional" | "equivalence" | "chance";
type Association = { id: string; label: string; direction: DirectionClass; phrase: string; needsSecond: boolean };

// Generation
type Labelled = { hypothesis: Hypothesis; label: string; listed: boolean; effectiveKind: string; groupIndex: number };
predictionSentence(project, h, tense: "will" | "would" = "will"): string;
variableLists(project): { role: string; label: string; names: string[] }[];
type DesignTableRow = { label; question; hypothesis; samplingPlan; analysisPlan; sensitivityRationale;
  interpretation; theoryAtStake: string };

// Criteria
type Status = "pass" | "warn" | "fail" | "na" | "pending";
type CheckResult = { criterion: string; status: Status; message: string };
type Criterion = { id: string; number: number; title: string; why: string; fix: string; sources: Citation[];
  basis: "literature" | "convention" };
type Citation = { id: string; short: string; full: string; doi?: string; url?: string; titleCheck?: string };
type Scorecard = { label: string; hypothesis: Hypothesis; results: CheckResult[]; passed: number;
  applicable: number; failures: number };
type ProjectIssue = { criterion: string; status: Status; message: string };
type AuthoringAssessment = { cards: Scorecard[]; issues: ProjectIssue[] };

// Free text
type Specificity = { level: 0 | 1 | 2 | 3; hasHypothesis: boolean; hasDirection: boolean; hasMagnitude: boolean;
  hasDisconfirm: boolean };
type Candidate = { text: string; start: number; end: number; label?: string; context?: string };
defaultAccepted(items: { hypothesisId: string; quoteVerified: boolean }[]): Set<string>;

// AI tasks
type ExtractedItem = { hypothesisId: string; label: string; quote: string; quoteVerified: boolean };
type Critique = { suggestions: { criterion: string; comment: string; rewrite: string }[]; improved_statement: string };
interface AiTaskOptions { signal?: AbortSignal }
type AiTaskResult<T> =
  | ({ ok: true; model: string; provenance: LlmProvenance } & T)      // T = { project, items } | { critique } | { questions }
  | { ok: false; reason: "unusable_reply" | "client_error"; error?: string; provenance: LlmProvenance };
aiExtract(document, client, options?: AiTaskOptions & IdOptions & { maxChars?: number });
interface LlmRecording { promptId: string; promptSha256: string; response: LlmResponse }
replayClient(recordings, options?: { matchBy?: "promptSha256" | "promptId" }): LlmClient & { calls: LlmRequest[] };
recordingClient(inner): LlmClient & { recordings: LlmRecording[] };
```

Legacy importer (`hypocheck/export-xlsx`): `ImportReport = { project: Project; warnings: string[] }`.

## Experimental (`hypocheck/experimental`)

```ts
type DocumentRole = "paper" | "preregistration" | "stage1" | "supplement";
type CanonicalSection = "abstract" | "introduction" | "hypotheses" | "methods" | "results" | "discussion"
  | "references" | "other";
type Section = { id: string; label: string; canonicalLabel?: CanonicalSection; start: number; end: number };
type Coverage = { status: "complete" | "partial" | "none"; readSectionIds: string[]; unreadSectionIds: string[];
  skippedSectionIds: string[]; unavailable: string[] };
type GraphDocument = { id; doi?; role: DocumentRole; textSha256; extractor: { name; version }; offsetUnit: "utf16";
  sections: Section[]; coverage: Coverage };
type Study = { id: string; label?: string; documentIds: string[]; anchorIds: string[] };
type Provenance = { kind: "deterministic" | "llm" | "human"; servedModel?: string | null; promptId?: string;
  promptSha256?: string; tool?: { name: string; version: string } };

type MatchMethod = "exact" | "normalized";
type NormalizationStep = "dehyphenate" | "quotes" | "dashes" | "whitespace" | "case";
type Anchor = { id; documentId; start; end; exact; prefix; suffix; sectionId?; page?; matchMethod: MatchMethod;
  normalization: NormalizationStep[] };

type EvidenceValue<T> =
  | { state: "observed"; value: T; evidenceIds: string[] }                       // at least one evidence id
  | { state: "inferred"; value: T; evidenceIds: string[]; method: string }
  | { state: "not_located"; searchedDocumentIds: string[] }
  | { state: "not_supplied"; reason: string }
  | { state: "conflicting"; alternatives: { value: T; evidenceIds: string[] }[] }  // at least two
  | { state: "not_applicable"; reason: string };
type Direction = "positive" | "negative" | "nondirectional" | "equivalence" | "chance";
type Sidedness = "one" | "two";
type HypothesisStatus = "confirmatory" | "focal" | "exploratory" | "auxiliary" | "manipulation_check";
type ResultDirection = "positive" | "negative" | "none";
type HypothesisFields = { direction; sidedness; tailDirection; status; predictor; outcome; comparison; population;
  sesoi; expectedEffect; test; falsification };   // each an EvidenceValue
type HypothesisLabel = { label: string; studyId: string; documentId: string; anchorId?: string };
type Component = { id: string; path: string; text: string; anchorId?: string };
type HypothesisNode = { id; scientificId?; labels: HypothesisLabel[]; studyId; documentId; statement;
  statementAnchorId; components: Component[]; logic: "single" | "all" | "any" | "unspecified";
  fields: HypothesisFields; provenance: Provenance };
type DecisionRule = { id; hypothesisId; source: "author";
  kind: "support" | "falsify" | "inconclusive" | "equivalence_bounds" | "alpha" | "other";
  text: string; anchorIds: string[]; timing: "prospective" | "unknown" };
type AnalysisRef = { id: string /* "<namespace>:<local id>" */; studyId?; description?; anchorIds: string[];
  observedDirection?: EvidenceValue<ResultDirection>; validation: "unvalidated" | "host_validated" };
type LinkRelation = "tests" | "supports" | "contradicts" | "inconclusive" | "correspondsTo" | "revises"
  | "hasComponent" | "states" | "discusses";
type ReviewStatus = "unreviewed" | "human-confirmed" | "human-rejected";
type Link = { id; from; to; relation: LinkRelation;
  outcomeBasis?: "authorReported" | "computedUnderAuthorRule" | "reviewer";
  evidenceIds: string[]; origin: Provenance; reviewStatus: ReviewStatus };
type Verdict = "OK" | "NOTE" | "WARN" | "FLAG" | "NOT_ASSESSABLE";
type Premise = { role: string; anchor: Anchor; source: "literal_text" | "llm_extraction" | "human" };
type Assessment = { id; ruleId; ruleName; ruleSetVersion;
  target: { documentId?: string; hypothesisId?: string; linkId?: string };
  applicability: "applicable" | "not_applicable"; verdict: Verdict | null; rawVerdict: Verdict | null;
  capsApplied: string[]; premises: Premise[]; explanation: string; groupId?: string; llmDependent: boolean };
type EvidenceGraph = { format: "hypocheck.graph"; version: "0.1.0"; createdBy: { name; version };
  documents; studies; hypotheses; anchors; decisionRules; analysisRefs; links; assessments };

// Anchoring
interface AnchorQuoteOptions { documentId: string; prefix?: string; suffix?: string; contextChars?: number;
  sections?: Section[]; within?: { start: number; end: number }; allowNormalized?: boolean;
  minNormalizedLength?: number }
type AnchorQuoteResult = { status: "unique" | "ambiguous" | "not_found"; anchors: Anchor[] };
type AnchorProblemCode = "unknown_document" | "text_hash_mismatch" | "bad_range" | "out_of_range"
  | "exact_mismatch" | "prefix_mismatch" | "suffix_mismatch" | "section_mismatch";
type AnchorProblem = { anchorId: string; code: AnchorProblemCode; message: string };
type ValidateAnchorsResult = { valid: boolean; problems: AnchorProblem[] };
normalizeWithMap(text, steps?): { text: string; map: number[] };   // map[i] = original index of normalized char i
makeAnchor(text, documentId, start, end, options?: { contextChars?; sections?; matchMethod?; normalization? });

// Text scanners
type TextMatch = { start: number; end: number; exact: string; pattern: string };
type SidednessMatch = TextMatch & { sided: "one" | "two" };
type CountClaim = TextMatch & { count: number };
type LabelOccurrence = { label: string; start; end; exact; sectionId?: string; sectionClass?: CanonicalSection };
type SentenceSpan = { start: number; end: number; text: string };
rangesFor(text, sections, classes): { ranges: { start; end; sectionId? }[]; sectionsKnown: boolean };

// Ledger
interface BundleDocument { id; role: DocumentRole; text: string; doi?; sections?: Section[]; extractor: Extractor;
  unavailable?: string[] }
interface DocumentBundle { documents: BundleDocument[]; studyId?: string; studyLabel?: string }
interface ExtractLedgerOptions { budgetChars: number; skipSectionClasses?: CanonicalSection[]; maxCalls?: number;
  signal?: AbortSignal }
type LedgerChunk = { id; documentId; start; end; sectionIds: string[] };
type LedgerCall = { chunk: LedgerChunk; promptId; promptSha256; servedModel: string | null;
  status: "ok" | "unusable_reply" | "client_error" | "not_run"; error?: string; proposed: number; anchored: number };
type UnanchoredItem = { documentId; chunkId; quote; label; reason: "quote_not_found" };
type LedgerResult = { graph: EvidenceGraph; calls: LedgerCall[]; unanchored: UnanchoredItem[]; warnings: string[] };
planChunks(doc, budgetChars, skipSectionClasses?): { chunks: LedgerChunk[]; sections: Section[]; skipped: string[] };

// Evaluation
type RuleId = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7";
type RuleDefinition = { id: RuleId; name; title; cap: "NOTE" | "WARN"; crossDocument: boolean; decidedBy: string;
  sources: string[] };
interface EvaluateOptions { texts?: Record<string, string>; rules?: RuleId[] }
type DocumentInputHash = { documentId; textSha256; textSupplied: boolean; textMatches: boolean };
type EvaluationReport = { format: "hypocheck.report"; formatVersion; libraryVersion; ruleSetVersion;
  graphFormatVersion; inputHashes: { graphSha256: string; documents: DocumentInputHash[] }; rulesRun: RuleId[];
  assessments: Assessment[];
  summary: { byVerdict: Record<Verdict | "not_applicable", number>; byRule: Record<string, Record<Verdict | "not_applicable", number>> } };
interface CapContext { rule: RuleDefinition; llmDependent: boolean; links: Link[] }

// Plugin mapping
type PluginIssueLocation = { page?: number; paragraph?: number; characterStart?: number; characterEnd?: number;
  contextText?: string };
type PluginIssue = { id; severity: "error" | "warning" | "info"; isFinding?: boolean; category; title; description;
  location?: PluginIssueLocation; suggestion?: { type: "replace" | "delete" | "manual"; instructions?: string };
  metadata?: Record<string, unknown> };
interface PluginPolicy { minVerdict?: "NOTE" | "WARN"; includeSummary?: boolean; category?: string;
  idPrefix?: string; documentId?: string }
```

`toPluginIssues` only ever emits `severity: "warning"` or `"info"` and `suggestion.type: "manual"`; `"error"`,
`"replace"` and `"delete"` exist in the type because the host's shape has them.
