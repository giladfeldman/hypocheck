/**
 * Evidence-graph interchange format v0.1.0 (`format: "hypocheck.graph"`). EXPERIMENTAL: the
 * shape may change in any 0.x release; `version` changes whenever it does.
 *
 * A graph records what a set of documents says about hypotheses, with every claim traceable to
 * a source span: documents (identified by text hash), studies, hypotheses (author wording,
 * components, field-level evidence states), anchors (exact offsets plus quote and context),
 * the authors' own decision rules, namespaced references to analyses held by other tools,
 * typed links, and rule assessments.
 *
 * Offsets: zero-based, end-exclusive UTF-16 code-unit offsets into the exact text whose SHA-256
 * is `documents[].textSha256`. They are valid only against that text.
 */
import { z } from "zod";
import { sha256 } from "../hash.js";

export const GRAPH_FORMAT = "hypocheck.graph" as const;
export const GRAPH_FORMAT_VERSION = "0.1.0" as const;

export const DocumentRoleSchema = z.enum(["paper", "preregistration", "stage1", "supplement"]);
export type DocumentRole = z.infer<typeof DocumentRoleSchema>;

/** Canonical section classes the rules understand. */
export const CanonicalSectionSchema = z.enum([
  "abstract",
  "introduction",
  "hypotheses",
  "methods",
  "results",
  "discussion",
  "references",
  "other",
]);
export type CanonicalSection = z.infer<typeof CanonicalSectionSchema>;

export const SectionSchema = z.object({
  id: z.string().min(1),
  /** The heading as it appears in the document. */
  label: z.string(),
  canonicalLabel: CanonicalSectionSchema.optional(),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});
export type Section = z.infer<typeof SectionSchema>;

export const ExtractorSchema = z.object({ name: z.string().min(1), version: z.string().min(1) });
export type Extractor = z.infer<typeof ExtractorSchema>;

/** Which parts of a document a process actually read. Absence-dependent conclusions need it. */
export const CoverageSchema = z.object({
  status: z.enum(["complete", "partial", "none"]),
  /** "complete" = every section selected for reading was read (deliberately skipped ones are listed separately). */
  readSectionIds: z.array(z.string()),
  /** Sections selected for reading that were not read (e.g. the model call failed). */
  unreadSectionIds: z.array(z.string()),
  /** Sections not read by policy (e.g. references). */
  skippedSectionIds: z.array(z.string()).default([]),
  /** Materials the document refers to that were not supplied (e.g. "Supplementary Table S2"). */
  unavailable: z.array(z.string()).default([]),
});
export type Coverage = z.infer<typeof CoverageSchema>;

export const GraphDocumentSchema = z.object({
  id: z.string().min(1),
  doi: z.string().optional(),
  role: DocumentRoleSchema,
  textSha256: z.string().regex(/^[0-9a-f]{64}$/),
  extractor: ExtractorSchema,
  offsetUnit: z.literal("utf16"),
  sections: z.array(SectionSchema),
  coverage: CoverageSchema,
});
export type GraphDocument = z.infer<typeof GraphDocumentSchema>;

export const StudySchema = z.object({
  id: z.string().min(1),
  /** The authors' own name for the study ("Study 2"), if any. */
  label: z.string().optional(),
  documentIds: z.array(z.string()),
  anchorIds: z.array(z.string()).default([]),
});
export type Study = z.infer<typeof StudySchema>;

export const ProvenanceSchema = z.object({
  /** deterministic = literal text or code; llm = a model proposed it; human = a person entered or confirmed it. */
  kind: z.enum(["deterministic", "llm", "human"]),
  servedModel: z.string().nullable().optional(),
  promptId: z.string().optional(),
  promptSha256: z.string().optional(),
  tool: z.object({ name: z.string(), version: z.string() }).optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

/**
 * How a quote was matched: "exact" (byte-for-byte UTF-16 match) or "normalized" (after the
 * transformations listed in `normalization`).
 */
export const MatchMethodSchema = z.enum(["exact", "normalized"]);
export type MatchMethod = z.infer<typeof MatchMethodSchema>;

export const NormalizationStepSchema = z.enum(["dehyphenate", "quotes", "dashes", "whitespace", "case"]);
export type NormalizationStep = z.infer<typeof NormalizationStepSchema>;

export const AnchorSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  /** text.slice(start, end): the source span as it is in the document. */
  exact: z.string(),
  prefix: z.string(),
  suffix: z.string(),
  sectionId: z.string().optional(),
  page: z.number().int().positive().optional(),
  matchMethod: MatchMethodSchema,
  normalization: z.array(NormalizationStepSchema).default([]),
});
export type Anchor = z.infer<typeof AnchorSchema>;

/** One source-located value inside a "conflicting" state. */
export const EvidenceAlternativeSchema = z.object({ value: z.unknown(), evidenceIds: z.array(z.string()) });

/**
 * A field value together with how we know it. Never an empty string standing in for
 * "we did not find it": the six states keep observed, inferred, not located, not supplied,
 * conflicting and not applicable apart.
 */
export function evidenceValue<T extends z.ZodType>(value: T) {
  return z.discriminatedUnion("state", [
    z.object({ state: z.literal("observed"), value, evidenceIds: z.array(z.string()).min(1) }),
    z.object({ state: z.literal("inferred"), value, evidenceIds: z.array(z.string()), method: z.string().min(1) }),
    z.object({ state: z.literal("not_located"), searchedDocumentIds: z.array(z.string()) }),
    z.object({ state: z.literal("not_supplied"), reason: z.string().min(1) }),
    z.object({
      state: z.literal("conflicting"),
      alternatives: z.array(z.object({ value, evidenceIds: z.array(z.string()) })).min(2),
    }),
    z.object({ state: z.literal("not_applicable"), reason: z.string().min(1) }),
  ]);
}

export type EvidenceValue<T> =
  | { state: "observed"; value: T; evidenceIds: string[] }
  | { state: "inferred"; value: T; evidenceIds: string[]; method: string }
  | { state: "not_located"; searchedDocumentIds: string[] }
  | { state: "not_supplied"; reason: string }
  | { state: "conflicting"; alternatives: { value: T; evidenceIds: string[] }[] }
  | { state: "not_applicable"; reason: string };

export type EvidenceState = EvidenceValue<unknown>["state"];

export const DirectionSchema = z.enum(["positive", "negative", "nondirectional", "equivalence", "chance"]);
export type Direction = z.infer<typeof DirectionSchema>;
export const SidednessSchema = z.enum(["one", "two"]);
export type Sidedness = z.infer<typeof SidednessSchema>;
export const HypothesisStatusSchema = z.enum(["confirmatory", "focal", "exploratory", "auxiliary", "manipulation_check"]);
export type HypothesisStatus = z.infer<typeof HypothesisStatusSchema>;
export const ResultDirectionSchema = z.enum(["positive", "negative", "none"]);
export type ResultDirection = z.infer<typeof ResultDirectionSchema>;

export const HypothesisFieldsSchema = z.object({
  direction: evidenceValue(DirectionSchema),
  /** Stated sidedness of the test of this hypothesis. Unstated is "not_located", never assumed. */
  sidedness: evidenceValue(SidednessSchema),
  /** For a one-sided test: which direction the tested alternative points. */
  tailDirection: evidenceValue(z.enum(["positive", "negative"])),
  status: evidenceValue(HypothesisStatusSchema),
  predictor: evidenceValue(z.string()),
  outcome: evidenceValue(z.string()),
  comparison: evidenceValue(z.string()),
  population: evidenceValue(z.string()),
  /** Smallest effect size of interest, only as the authors call it that. */
  sesoi: evidenceValue(z.string()),
  /** Effect the authors expect or power for (never the SESOI). */
  expectedEffect: evidenceValue(z.string()),
  test: evidenceValue(z.string()),
  falsification: evidenceValue(z.string()),
});
export type HypothesisFields = z.infer<typeof HypothesisFieldsSchema>;

export const HypothesisLabelSchema = z.object({
  /** The authors' label as written ("H1", "Hypothesis 2a"). */
  label: z.string().min(1),
  /** Labels are namespaced by study and document: "H1" in Study 1 is not "H1" in Study 2. */
  studyId: z.string().min(1),
  documentId: z.string().min(1),
  anchorId: z.string().optional(),
});
export type HypothesisLabel = z.infer<typeof HypothesisLabelSchema>;

export const ComponentSchema = z.object({
  id: z.string().min(1),
  /** Component path inside the hypothesis ("c0", "c1"), part of the occurrence id. */
  path: z.string().min(1),
  text: z.string(),
  anchorId: z.string().optional(),
});
export type Component = z.infer<typeof ComponentSchema>;

export const HypothesisNodeSchema = z.object({
  /** Occurrence id: `occurrenceId(textSha256, start, end, componentPath)`. Stable for a fixed text. */
  id: z.string().min(1),
  /** Persisted identity across runs and revisions, assigned by a host or reviewer; never inferred here. */
  scientificId: z.string().optional(),
  labels: z.array(HypothesisLabelSchema),
  studyId: z.string().min(1),
  documentId: z.string().min(1),
  /** Exact source wording (equals the statement anchor's `exact`). */
  statement: z.string().min(1),
  statementAnchorId: z.string().min(1),
  components: z.array(ComponentSchema).min(1),
  /** How components combine. "single" = one component. */
  logic: z.enum(["single", "all", "any", "unspecified"]),
  fields: HypothesisFieldsSchema,
  provenance: ProvenanceSchema,
});
export type HypothesisNode = z.infer<typeof HypothesisNodeSchema>;

/** A decision rule the AUTHORS stated. An analyst-added rule or SESOI has no place here. */
export const DecisionRuleSchema = z.object({
  id: z.string().min(1),
  hypothesisId: z.string().min(1),
  source: z.literal("author"),
  kind: z.enum(["support", "falsify", "inconclusive", "equivalence_bounds", "alpha", "other"]),
  text: z.string().min(1),
  anchorIds: z.array(z.string()).min(1),
  /** "prospective" only when the documents establish it (e.g. a dated preregistration). */
  timing: z.enum(["prospective", "unknown"]),
});
export type DecisionRule = z.infer<typeof DecisionRuleSchema>;

/** Namespaced host id: "<namespace>:<local id>", e.g. "stats:row:12" or "tables:T1:row:3". */
export const NamespacedIdSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]*:.+$/);

export const AnalysisRefSchema = z.object({
  id: NamespacedIdSchema,
  studyId: z.string().optional(),
  description: z.string().optional(),
  anchorIds: z.array(z.string()).default([]),
  /** Direction of the observed result, when established. */
  observedDirection: evidenceValue(ResultDirectionSchema).optional(),
  /** Whether the host tool validated the referenced statistic itself. */
  validation: z.enum(["unvalidated", "host_validated"]).default("unvalidated"),
});
export type AnalysisRef = z.infer<typeof AnalysisRefSchema>;

export const LinkRelationSchema = z.enum([
  "tests",
  "supports",
  "contradicts",
  "inconclusive",
  "correspondsTo",
  "revises",
  "hasComponent",
  "states",
  "discusses",
]);
export type LinkRelation = z.infer<typeof LinkRelationSchema>;

export const ReviewStatusSchema = z.enum(["unreviewed", "human-confirmed", "human-rejected"]);
export type ReviewStatus = z.infer<typeof ReviewStatusSchema>;

export const LinkSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  relation: LinkRelationSchema,
  /** For supports / contradicts / inconclusive: whose conclusion this is. */
  outcomeBasis: z.enum(["authorReported", "computedUnderAuthorRule", "reviewer"]).optional(),
  evidenceIds: z.array(z.string()),
  origin: ProvenanceSchema,
  reviewStatus: ReviewStatusSchema,
});
export type Link = z.infer<typeof LinkSchema>;

export const VerdictSchema = z.enum(["OK", "NOTE", "WARN", "FLAG", "NOT_ASSESSABLE"]);
export type Verdict = z.infer<typeof VerdictSchema>;

export const PremiseSchema = z.object({
  /** What the premise establishes, e.g. "prediction", "stated sidedness", "conclusion sentence". */
  role: z.string().min(1),
  anchor: AnchorSchema,
  /** literal_text = found by a deterministic scan; llm_extraction = proposed by a model; human = entered or confirmed by a person. */
  source: z.enum(["literal_text", "llm_extraction", "human"]),
});
export type Premise = z.infer<typeof PremiseSchema>;

export const AssessmentSchema = z.object({
  id: z.string().min(1),
  ruleId: z.string().min(1),
  ruleName: z.string().min(1),
  ruleSetVersion: z.string().min(1),
  target: z.object({ documentId: z.string().optional(), hypothesisId: z.string().optional(), linkId: z.string().optional() }),
  applicability: z.enum(["applicable", "not_applicable"]),
  /** null exactly when applicability is "not_applicable" (not applicable is never OK). */
  verdict: VerdictSchema.nullable(),
  /** The rule's own verdict before caps. */
  rawVerdict: VerdictSchema.nullable(),
  capsApplied: z.array(z.string()),
  premises: z.array(PremiseSchema),
  explanation: z.string(),
  /** Assessments sharing a groupId are one concern for the user (e.g. R2 + R3 on one claim). */
  groupId: z.string().optional(),
  llmDependent: z.boolean(),
});
export type Assessment = z.infer<typeof AssessmentSchema>;

export const GraphSchema = z.object({
  format: z.literal(GRAPH_FORMAT),
  version: z.literal(GRAPH_FORMAT_VERSION),
  createdBy: z.object({ name: z.string(), version: z.string() }),
  documents: z.array(GraphDocumentSchema),
  studies: z.array(StudySchema),
  hypotheses: z.array(HypothesisNodeSchema),
  anchors: z.array(AnchorSchema),
  decisionRules: z.array(DecisionRuleSchema).default([]),
  analysisRefs: z.array(AnalysisRefSchema).default([]),
  links: z.array(LinkSchema).default([]),
  assessments: z.array(AssessmentSchema).default([]),
});
export type EvidenceGraph = z.infer<typeof GraphSchema>;

/** Validate (and default) a graph. Throws a zod error listing every problem. */
export function parseGraph(input: unknown): EvidenceGraph {
  return GraphSchema.parse(input);
}

/** JSON Schema (draft 2020-12) of the graph format, generated from the zod schema. */
export function graphJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(GraphSchema, { target: "draft-2020-12", io: "input" }) as Record<string, unknown>;
}

/** Occurrence id: hash of the document text hash, the span and the component path. */
export function occurrenceId(textSha256: string, start: number, end: number, componentPath = ""): string {
  return `h_${sha256(`${textSha256}:${start}:${end}:${componentPath}`).slice(0, 20)}`;
}

/** Referential checks zod cannot express: every id a graph mentions must exist. */
export function checkGraphReferences(graph: EvidenceGraph): string[] {
  const problems: string[] = [];
  const docs = new Set(graph.documents.map((d) => d.id));
  const anchors = new Map(graph.anchors.map((a) => [a.id, a]));
  const studies = new Set(graph.studies.map((s) => s.id));
  const nodeIds = new Set<string>([
    ...graph.hypotheses.map((h) => h.id),
    ...graph.hypotheses.flatMap((h) => h.components.map((c) => c.id)),
    ...graph.analysisRefs.map((a) => a.id),
    ...graph.decisionRules.map((r) => r.id),
    ...graph.anchors.map((a) => a.id),
    ...graph.documents.map((d) => d.id),
    ...graph.studies.map((s) => s.id),
  ]);
  const dup = (name: string, ids: string[]) => {
    const seen = new Set<string>();
    for (const id of ids) {
      if (seen.has(id)) problems.push(`duplicate ${name} id ${id}`);
      seen.add(id);
    }
  };
  dup("document", graph.documents.map((d) => d.id));
  dup("anchor", graph.anchors.map((a) => a.id));
  dup("hypothesis", graph.hypotheses.map((h) => h.id));
  dup("link", graph.links.map((l) => l.id));
  for (const a of graph.anchors) {
    if (!docs.has(a.documentId)) problems.push(`anchor ${a.id}: unknown document ${a.documentId}`);
    if (a.end < a.start) problems.push(`anchor ${a.id}: end before start`);
  }
  const anchorRef = (where: string, id: string | undefined) => {
    if (id !== undefined && !anchors.has(id)) problems.push(`${where}: unknown anchor ${id}`);
  };
  for (const s of graph.studies) for (const d of s.documentIds) if (!docs.has(d)) problems.push(`study ${s.id}: unknown document ${d}`);
  for (const h of graph.hypotheses) {
    if (!docs.has(h.documentId)) problems.push(`hypothesis ${h.id}: unknown document ${h.documentId}`);
    if (!studies.has(h.studyId)) problems.push(`hypothesis ${h.id}: unknown study ${h.studyId}`);
    anchorRef(`hypothesis ${h.id} statement`, h.statementAnchorId);
    const sa = anchors.get(h.statementAnchorId);
    if (sa && sa.exact !== h.statement) problems.push(`hypothesis ${h.id}: statement differs from its anchor's exact text`);
    for (const l of h.labels) anchorRef(`hypothesis ${h.id} label ${l.label}`, l.anchorId);
    for (const c of h.components) anchorRef(`hypothesis ${h.id} component ${c.id}`, c.anchorId);
    for (const [name, f] of Object.entries(h.fields) as [string, EvidenceValue<unknown>][]) {
      const ids =
        f.state === "observed" || f.state === "inferred"
          ? f.evidenceIds
          : f.state === "conflicting"
            ? f.alternatives.flatMap((x) => x.evidenceIds)
            : [];
      for (const id of ids) anchorRef(`hypothesis ${h.id} field ${name}`, id);
    }
  }
  for (const r of graph.decisionRules) for (const id of r.anchorIds) anchorRef(`decision rule ${r.id}`, id);
  for (const l of graph.links) {
    if (!nodeIds.has(l.from)) problems.push(`link ${l.id}: unknown from ${l.from}`);
    if (!nodeIds.has(l.to)) problems.push(`link ${l.id}: unknown to ${l.to}`);
    for (const id of l.evidenceIds) anchorRef(`link ${l.id}`, id);
  }
  return problems;
}
