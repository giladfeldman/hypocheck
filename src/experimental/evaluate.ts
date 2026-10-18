/**
 * evaluatePublished: rule set "published-0.1.0" — a source-grounded consistency checker on a
 * hypothesis ledger. EXPERIMENTAL and NOT VALIDATED: no rule has passed a precision gate, so
 * every adverse verdict is capped (see RULES and applyCaps) and nothing is ever a FLAG in 0.x.
 *
 * What it is not: a judge of whether hypotheses or papers are good. The 18 authoring criteria
 * are never applied here (absence in a text is not absence in the study).
 *
 * Guarantees enforced in code, whatever a rule computes:
 *  - no FLAG in 0.x (demoted to WARN);
 *  - a premise proposed by a model (or an inferred field) caps the verdict at NOTE;
 *  - a cross-document rule caps at NOTE unless every link it relies on is human-confirmed;
 *  - every NOTE/WARN carries premises with anchors that re-slice against the supplied text,
 *    otherwise the verdict becomes NOT_ASSESSABLE;
 *  - "not applicable" is a separate applicability with a null verdict, never OK.
 */
import { canonicalJson, sha256 } from "../hash.js";
import { LIBRARY_VERSION } from "../version.js";
import { makeAnchor, validateAnchors } from "./anchor.js";
import {
  GRAPH_FORMAT_VERSION,
  GraphSchema,
  type Anchor,
  type Assessment,
  type EvidenceGraph,
  type EvidenceValue,
  type GraphDocument,
  type HypothesisNode,
  type Link,
  type Premise,
  type Provenance,
  type Verdict,
} from "./graph.js";
import {
  INTERACTION_TEST_RE,
  MODERATION_HYPOTHESIS_RE,
  findAbsenceBasis,
  findAbsenceClaims,
  findHypothesisCountClaims,
  findNonsignificance,
  findRejectionClaims,
  findSubgroupSignificance,
  findSupportLanguage,
  findTrendLanguage,
  labelInventory,
  rangesFor,
  sectionClass,
  sentencesIn,
  type SentenceSpan,
} from "./textscan.js";

export const RULE_SET_VERSION = "published-0.1.0";
export const REPORT_FORMAT = "hypocheck.report" as const;
export const REPORT_FORMAT_VERSION = "0.1.0";

export type RuleId = "R1" | "R2" | "R3" | "R4" | "R5" | "R6" | "R7";

export interface RuleDefinition {
  id: RuleId;
  name: string;
  title: string;
  /** Highest verdict the rule may emit in this rule set, before the provenance caps. */
  cap: "NOTE" | "WARN";
  crossDocument: boolean;
  /** What decides: deterministic text scan, graph fields (usually model-proposed), or both. */
  decidedBy: string;
  /** Citation ids from CITATIONS (DOIs verified against Crossref). */
  sources: string[];
}

export const RULES: RuleDefinition[] = [
  { id: "R1", name: "ledger_consistency", title: "Hypothesis labels stated, tested and counted consistently", cap: "WARN", crossDocument: false, decidedBy: "deterministic label inventory over section ranges; ledger labels", sources: ["vandenakker2023", "bakker2020"] },
  { id: "R2", name: "nonsignificance_as_support", title: "A non-significant result used as support for absence or as a rejection", cap: "NOTE", crossDocument: false, decidedBy: "deterministic sentence scan", sources: ["lakens2018"] },
  { id: "R3", name: "absence_claim_basis", title: "An absence claim with no located equivalence, interval or Bayesian basis", cap: "NOTE", crossDocument: false, decidedBy: "deterministic scan of every supplied document", sources: ["lakens2018"] },
  { id: "R4", name: "direction_test_alignment", title: "Directional prediction vs stated tail or reported result direction", cap: "WARN", crossDocument: false, decidedBy: "graph fields and links", sources: ["meehl1967", "lakensdebruine2021"] },
  { id: "R5", name: "trend_language", title: "\"Marginally significant\" or \"trend\" wording used as support", cap: "NOTE", crossDocument: false, decidedBy: "deterministic sentence scan", sources: ["lakensdebruine2021"] },
  { id: "R6", name: "explicit_mismatch", title: "A moderation prediction argued from subgroup significance without a test of the difference", cap: "NOTE", crossDocument: false, decidedBy: "ledger hypothesis wording + deterministic sentence scan", sources: ["lakensdebruine2021"] },
  { id: "R7", name: "prereg_delta", title: "Preregistration or Stage 1 differs from the paper", cap: "NOTE", crossDocument: true, decidedBy: "correspondence links + graph fields", sources: ["vandenakker2023"] },
];

export const RULE_BY_ID: Record<RuleId, RuleDefinition> = Object.fromEntries(RULES.map((r) => [r.id, r])) as Record<RuleId, RuleDefinition>;

export interface EvaluateOptions {
  /** Document texts by document id. Each must hash to the document's textSha256. */
  texts?: Record<string, string>;
  /** Rules to run (default all). */
  rules?: RuleId[];
}

export interface DocumentInputHash {
  documentId: string;
  textSha256: string;
  textSupplied: boolean;
  /** false when a supplied text does not match textSha256 (that document is then not read). */
  textMatches: boolean;
}

export interface EvaluationReport {
  format: typeof REPORT_FORMAT;
  formatVersion: string;
  libraryVersion: string;
  ruleSetVersion: string;
  graphFormatVersion: string;
  inputHashes: { graphSha256: string; documents: DocumentInputHash[] };
  rulesRun: RuleId[];
  assessments: Assessment[];
  summary: { byVerdict: Record<Verdict | "not_applicable", number>; byRule: Record<string, Record<Verdict | "not_applicable", number>> };
}

// ───────────────────────── caps ─────────────────────────

const RANK: Record<Verdict, number> = { OK: 0, NOT_ASSESSABLE: 0, NOTE: 1, WARN: 2, FLAG: 3 };
const isAdverse = (v: Verdict | null): v is "NOTE" | "WARN" | "FLAG" => v === "NOTE" || v === "WARN" || v === "FLAG";

export interface CapContext {
  rule: RuleDefinition;
  llmDependent: boolean;
  /** Links the verdict depends on (cross-document rules need all human-confirmed). */
  links: Link[];
}

/** Apply the 0.x caps to a rule's raw verdict. Only adverse verdicts are ever lowered. */
export function applyCaps(raw: Verdict | null, ctx: CapContext): { verdict: Verdict | null; capsApplied: string[] } {
  if (!isAdverse(raw)) return { verdict: raw, capsApplied: [] };
  let v: Verdict = raw;
  const caps: string[] = [];
  const lower = (to: "NOTE" | "WARN", why: string) => {
    if (RANK[v] > RANK[to]) {
      v = to;
      caps.push(why);
    }
  };
  lower("WARN", "no FLAG in 0.x");
  lower(ctx.rule.cap, `rule cap ${ctx.rule.cap} until validated`);
  if (ctx.llmDependent) lower("NOTE", "LLM-dependent premise");
  if (ctx.rule.crossDocument && !(ctx.links.length > 0 && ctx.links.every((l) => l.reviewStatus === "human-confirmed")))
    lower("NOTE", "cross-document rule without human-confirmed links");
  return { verdict: v, capsApplied: caps };
}

// ───────────────────────── context ─────────────────────────

interface Ctx {
  graph: EvidenceGraph;
  texts: Map<string, string>;
  docs: Map<string, GraphDocument>;
  anchors: Map<string, Anchor>;
}

interface Raw {
  rule: RuleId;
  target: Assessment["target"];
  applicable: boolean;
  verdict: Verdict | null;
  premises: Premise[];
  explanation: string;
  groupKey?: string;
  links?: Link[];
}

const na = (rule: RuleId, target: Assessment["target"], explanation: string): Raw => ({
  rule,
  target,
  applicable: false,
  verdict: null,
  premises: [],
  explanation,
});
const notAssessable = (rule: RuleId, target: Assessment["target"], explanation: string, premises: Premise[] = []): Raw => ({
  rule,
  target,
  applicable: true,
  verdict: "NOT_ASSESSABLE",
  premises,
  explanation,
});

function literal(ctx: Ctx, docId: string, start: number, end: number, role: string): Premise {
  const doc = ctx.docs.get(docId);
  return { role, anchor: makeAnchor(ctx.texts.get(docId) ?? "", docId, start, end, { sections: doc?.sections }), source: "literal_text" };
}

function sourceOf(prov: Provenance | undefined, ev?: EvidenceValue<unknown>): Premise["source"] {
  if (prov?.kind === "human") return "human";
  if (ev?.state === "inferred" && ev.method.startsWith("deterministic")) return "literal_text";
  if (ev?.state === "observed" && prov?.kind === "deterministic") return "literal_text";
  return "llm_extraction";
}

/** Premises for a field: its evidence anchors, or null when the field has no usable value. */
function fieldPremises(ctx: Ctx, h: HypothesisNode, field: keyof HypothesisNode["fields"], role: string): Premise[] | null {
  const ev = h.fields[field] as EvidenceValue<unknown>;
  if (ev.state !== "observed" && ev.state !== "inferred") return null;
  const out: Premise[] = [];
  for (const id of ev.evidenceIds) {
    const a = ctx.anchors.get(id);
    if (a) out.push({ role, anchor: a, source: sourceOf(h.provenance, ev) });
  }
  return out;
}

function statementPremise(ctx: Ctx, h: HypothesisNode): Premise | null {
  const a = ctx.anchors.get(h.statementAnchorId);
  return a ? { role: "prediction", anchor: a, source: h.provenance.kind === "human" ? "human" : "llm_extraction" } : null;
}

const valueOf = <T>(ev: EvidenceValue<T>): T | undefined => (ev.state === "observed" || ev.state === "inferred" ? ev.value : undefined);

function claimSentences(ctx: Ctx, docId: string): SentenceSpan[] {
  const text = ctx.texts.get(docId)!;
  const doc = ctx.docs.get(docId)!;
  const { ranges } = rangesFor(text, doc.sections, ["abstract", "results", "discussion"]);
  return sentencesIn(text, ranges);
}

function paragraphOf(text: string, start: number, end: number): string {
  const a = text.lastIndexOf("\n\n", start);
  const b = text.indexOf("\n\n", end);
  return text.slice(a < 0 ? 0 : a, b < 0 ? text.length : b);
}

const readable = (ctx: Ctx) => ctx.graph.documents.filter((d) => ctx.texts.has(d.id));

// ───────────────────────── R1 ─────────────────────────

function r1(ctx: Ctx): Raw[] {
  const out: Raw[] = [];
  const papers = ctx.graph.documents.filter((d) => d.role === "paper");
  if (!papers.length) return [na("R1", {}, "No document with role \"paper\".")];
  for (const doc of papers) {
    const target = { documentId: doc.id };
    const text = ctx.texts.get(doc.id);
    if (text === undefined) {
      out.push(notAssessable("R1", target, "Document text not supplied or does not match its hash."));
      continue;
    }
    const classes = new Map(doc.sections.map((s) => [s.id, sectionClass(s)]));
    if (![...classes.values()].includes("results")) {
      out.push(notAssessable("R1", target, "No results section identified, so where labels are tested cannot be established."));
      continue;
    }
    const inv = labelInventory(text, doc.sections);
    const statedClasses = new Set(["introduction", "hypotheses", "methods"]);
    const stated = inv.filter((o) => o.sectionClass && statedClasses.has(o.sectionClass));
    const tested = new Set(inv.filter((o) => o.sectionClass === "results").map((o) => o.label));
    if (!stated.length) {
      out.push(notAssessable("R1", target, "No hypothesis labels located in the introduction, hypotheses or methods sections (unlabelled prose cannot be inventoried)."));
      continue;
    }
    const firstStated = new Map<string, (typeof stated)[number]>();
    for (const o of stated) if (!firstStated.has(o.label)) firstStated.set(o.label, o);
    const concerns: Raw[] = [];
    for (const [label, occ] of firstStated) {
      const parent = label.replace(/[a-z]$/, "");
      const children = [...tested].some((t) => t !== label && t.startsWith(label) && /^[a-z]$/.test(t.slice(label.length)));
      if (tested.has(label) || tested.has(parent) || children) continue;
      concerns.push({
        rule: "R1",
        target,
        applicable: true,
        verdict: "NOTE",
        premises: [literal(ctx, doc.id, occ.start, occ.end, `label ${label} stated`)],
        explanation: `${label} is stated (${occ.sectionClass}) but its label is not mentioned in the results section. It may be reported without its label.`,
      });
    }
    // Explicit count contradictions, under either counting convention (main numbers or all labels).
    const mains = new Set([...firstStated.keys()].map((l) => l.replace(/[a-z]$/, "")));
    const all = new Set(firstStated.keys());
    const statedRanges = doc.sections.filter((s) => ["abstract", "introduction", "hypotheses", "methods"].includes(classes.get(s.id)!));
    for (const r of statedRanges) {
      for (const c of findHypothesisCountClaims(text.slice(r.start, r.end))) {
        if (c.count === mains.size || c.count === all.size) continue;
        concerns.push({
          rule: "R1",
          target,
          applicable: true,
          verdict: "WARN",
          premises: [
            literal(ctx, doc.id, r.start + c.start, r.start + c.end, "stated count"),
            ...[...firstStated.values()].map((o) => literal(ctx, doc.id, o.start, o.end, `label ${o.label}`)),
          ],
          explanation: `The text states ${c.count} hypotheses, but ${mains.size} distinct hypothesis numbers (${all.size} labels) are stated: ${[...all].join(", ")}.`,
        });
      }
    }
    // Duplicate labels in the ledger: one label, one study, different statements.
    const byLabel = new Map<string, HypothesisNode[]>();
    for (const h of ctx.graph.hypotheses.filter((x) => x.documentId === doc.id)) {
      for (const l of h.labels) {
        const k = `${l.studyId}:${l.label}`;
        byLabel.set(k, [...(byLabel.get(k) ?? []), h]);
      }
    }
    for (const [k, hs] of byLabel) {
      const distinct = [...new Map(hs.map((h) => [h.statement.trim(), h])).values()];
      if (distinct.length < 2) continue;
      concerns.push({
        rule: "R1",
        target,
        applicable: true,
        verdict: "NOTE",
        premises: distinct.map((h) => statementPremise(ctx, h)).filter((p): p is Premise => !!p),
        explanation: `Label ${k.split(":").slice(1).join(":")} is attached to ${distinct.length} different statements in the same study.`,
      });
    }
    if (concerns.length) out.push(...concerns);
    else
      out.push({
        rule: "R1",
        target,
        applicable: true,
        verdict: "OK",
        premises: [],
        explanation: `All ${firstStated.size} stated labels are mentioned in the results; no count contradiction located.`,
      });
  }
  return out;
}

// ───────────────────────── R2 + R3 ─────────────────────────

const claimKey = (docId: string, s: SentenceSpan) => `claim:${docId}:${s.start}-${s.end}`;

function r2(ctx: Ctx): Raw[] {
  const docs = readable(ctx);
  if (!docs.length) return [notAssessable("R2", {}, "No document text supplied.")];
  const out: Raw[] = [];
  let anyNonsig = false;
  for (const doc of docs) {
    for (const s of claimSentences(ctx, doc.id)) {
      if (!findNonsignificance(s.text).length) continue;
      anyNonsig = true;
      const claims = [...findAbsenceClaims(s.text), ...findRejectionClaims(s.text)];
      if (!claims.length || findAbsenceBasis(s.text).length) continue;
      out.push({
        rule: "R2",
        target: { documentId: doc.id },
        applicable: true,
        verdict: "NOTE",
        premises: [literal(ctx, doc.id, s.start, s.end, "sentence reporting a non-significant result and concluding absence or rejection")],
        explanation: `A non-significant result appears to be the stated basis for "${claims[0].exact}". Non-significance alone does not establish absence; an equivalence test, interval or Bayesian argument would.`,
        groupKey: claimKey(doc.id, s),
      });
    }
  }
  if (!anyNonsig) return [na("R2", {}, "No non-significant result is reported in the abstract, results or discussion.")];
  if (!out.length) return [{ rule: "R2", target: {}, applicable: true, verdict: "OK", premises: [], explanation: "No sentence uses a non-significant result as the basis for an absence claim or a rejection." }];
  return out;
}

function r3(ctx: Ctx): Raw[] {
  const docs = readable(ctx);
  if (!docs.length) return [notAssessable("R3", {}, "No document text supplied.")];
  const claims: { doc: GraphDocument; s: SentenceSpan; exact: string }[] = [];
  for (const doc of docs) {
    for (const s of claimSentences(ctx, doc.id)) {
      const c = findAbsenceClaims(s.text);
      if (c.length) claims.push({ doc, s, exact: c[0].exact });
    }
  }
  if (!claims.length) return [na("R3", {}, "No affirmative absence claim located in the abstract, results or discussion.")];
  const basisIn = docs.flatMap((d) => findAbsenceBasis(ctx.texts.get(d.id)!).map((m) => ({ d, m })));
  if (basisIn.length)
    return [
      {
        rule: "R3",
        target: {},
        applicable: true,
        verdict: "OK",
        premises: [literal(ctx, basisIn[0].d.id, basisIn[0].m.start, basisIn[0].m.end, "located basis for absence claims")],
        explanation: `A basis for absence claims is located (${basisIn.map((b) => b.m.pattern).filter((v, i, a) => a.indexOf(v) === i).join(", ")}).`,
      },
    ];
  const missing = ctx.graph.documents.filter((d) => !ctx.texts.has(d.id)).map((d) => d.id);
  const unavailable = ctx.graph.documents.flatMap((d) => d.coverage.unavailable);
  return claims.map(({ doc, s, exact }) => {
    const premise = literal(ctx, doc.id, s.start, s.end, "absence claim");
    if (missing.length || unavailable.length)
      return notAssessable(
        "R3",
        { documentId: doc.id },
        `Absence claim "${exact}" located, but not every material was searched (${[...missing.map((m) => `text of ${m} not supplied`), ...unavailable.map((u) => `unavailable: ${u}`)].join("; ")}).`,
        [premise],
      );
    return {
      rule: "R3" as const,
      target: { documentId: doc.id },
      applicable: true,
      verdict: "NOTE" as const,
      premises: [premise],
      explanation: `"${exact}" is concluded, and no equivalence test, equivalence bounds, Bayes factor or interval argument was located in the ${docs.length} supplied document(s).`,
      groupKey: claimKey(doc.id, s),
    };
  });
}

// ───────────────────────── R4 ─────────────────────────

function r4(ctx: Ctx): Raw[] {
  if (!ctx.graph.hypotheses.length) return [notAssessable("R4", {}, "The graph has no hypotheses.")];
  const out: Raw[] = [];
  for (const h of ctx.graph.hypotheses) {
    const target = { documentId: h.documentId, hypothesisId: h.id };
    const dir = h.fields.direction;
    if (dir.state === "not_applicable") {
      out.push(na("R4", target, `Direction not applicable: ${dir.reason}`));
      continue;
    }
    const d = valueOf(dir);
    if (d === undefined) {
      out.push(notAssessable("R4", target, `Predicted direction is ${dir.state.replace("_", " ")}.`));
      continue;
    }
    if (d !== "positive" && d !== "negative") {
      out.push(na("R4", target, `The prediction is ${d}, not directional.`));
      continue;
    }
    const dirPremises = fieldPremises(ctx, h, "direction", "predicted direction") ?? [];
    const stmt = statementPremise(ctx, h);
    const base = [...(stmt ? [stmt] : []), ...dirPremises.filter((p) => p.anchor.id !== stmt?.anchor.id)];
    const concerns: Raw[] = [];
    let assessed = false;
    // A: stated tail vs predicted direction.
    const sided = valueOf(h.fields.sidedness);
    if (sided === "two") assessed = true;
    if (sided === "one") {
      const tail = valueOf(h.fields.tailDirection);
      if (tail !== undefined) {
        assessed = true;
        if (tail !== d)
          concerns.push({
            rule: "R4",
            target,
            applicable: true,
            verdict: "WARN",
            premises: [...base, ...(fieldPremises(ctx, h, "sidedness", "stated sidedness") ?? []), ...(fieldPremises(ctx, h, "tailDirection", "tested tail") ?? [])],
            explanation: `The prediction is ${d}, but the one-sided test is stated to target the ${tail} direction.`,
          });
      }
    }
    // B: a result in the opposite direction linked as support.
    for (const l of ctx.graph.links.filter((x) => x.relation === "supports" && x.to === h.id)) {
      const ref = ctx.graph.analysisRefs.find((a) => a.id === l.from);
      const od = ref?.observedDirection;
      const rd = od ? valueOf(od) : undefined;
      if (!ref || rd === undefined) continue;
      assessed = true;
      if (rd === "none" || rd === d) continue;
      const linkSource: Premise["source"] = l.origin.kind === "human" || l.reviewStatus === "human-confirmed" ? "human" : l.origin.kind === "deterministic" ? "literal_text" : "llm_extraction";
      const resultAnchors = (od && (od.state === "observed" || od.state === "inferred") ? od.evidenceIds : [])
        .map((id) => ctx.anchors.get(id))
        .filter((a): a is Anchor => !!a)
        .map((a) => ({ role: "result direction", anchor: a, source: linkSource }));
      const linkAnchors = l.evidenceIds
        .map((id) => ctx.anchors.get(id))
        .filter((a): a is Anchor => !!a)
        .map((a) => ({ role: "support claim", anchor: a, source: linkSource }));
      concerns.push({
        rule: "R4",
        target: { ...target, linkId: l.id },
        applicable: true,
        verdict: "WARN",
        premises: [...base, ...resultAnchors, ...linkAnchors],
        explanation: `The prediction is ${d}, the linked result (${ref.id}) is ${rd}, and it is described as supporting the hypothesis. Contrast coding should be checked.`,
        links: [l],
      });
    }
    if (concerns.length) out.push(...concerns);
    else if (assessed)
      out.push({ rule: "R4", target, applicable: true, verdict: "OK", premises: [], explanation: "Stated sidedness and linked result directions are consistent with the predicted direction (a two-sided test of a directional prediction is fine)." });
    else out.push(notAssessable("R4", target, "Sidedness is not stated and no result direction is linked. Unstated sidedness is not an error."));
  }
  return out;
}

// ───────────────────────── R5 ─────────────────────────

function r5(ctx: Ctx): Raw[] {
  const docs = readable(ctx);
  if (!docs.length) return [notAssessable("R5", {}, "No document text supplied.")];
  const out: Raw[] = [];
  let any = false;
  for (const doc of docs) {
    for (const s of claimSentences(ctx, doc.id)) {
      const trend = findTrendLanguage(s.text);
      if (!trend.length) continue;
      any = true;
      const support = findSupportLanguage(s.text);
      if (!support.length) continue;
      out.push({
        rule: "R5",
        target: { documentId: doc.id },
        applicable: true,
        verdict: "NOTE",
        premises: [literal(ctx, doc.id, s.start, s.end, "trend wording used with support wording")],
        explanation: `"${trend[0].exact}" is used in the same clause context as "${support[0].exact}". A result that did not meet the stated threshold is described as support.`,
      });
    }
  }
  if (!any) return [na("R5", {}, "No trend or marginal-significance wording in the abstract, results or discussion.")];
  if (!out.length) return [{ rule: "R5", target: {}, applicable: true, verdict: "OK", premises: [], explanation: "Trend wording occurs but is not used as support." }];
  return out;
}

// ───────────────────────── R6 ─────────────────────────

function r6(ctx: Ctx): Raw[] {
  const out: Raw[] = [];
  for (const doc of ctx.graph.documents.filter((d) => d.role === "paper")) {
    const target = { documentId: doc.id };
    const text = ctx.texts.get(doc.id);
    if (text === undefined) {
      out.push(notAssessable("R6", target, "Document text not supplied or does not match its hash."));
      continue;
    }
    const hs = ctx.graph.hypotheses.filter((h) => h.documentId === doc.id);
    if (!hs.length) {
      out.push(notAssessable("R6", target, "No hypotheses in the ledger for this document."));
      continue;
    }
    const moderation = hs.filter((h) => MODERATION_HYPOTHESIS_RE.test(h.statement));
    if (!moderation.length) {
      out.push(na("R6", target, "No hypothesis predicts moderation."));
      continue;
    }
    const concerns: Raw[] = [];
    for (const s of claimSentences(ctx, doc.id)) {
      const m = findSubgroupSignificance(s.text);
      if (!m.length) continue;
      if (INTERACTION_TEST_RE.test(paragraphOf(text, s.start, s.end))) continue;
      const stmts = moderation.map((h) => statementPremise(ctx, h)).filter((p): p is Premise => !!p);
      concerns.push({
        rule: "R6",
        target,
        applicable: true,
        verdict: "NOTE",
        premises: [literal(ctx, doc.id, s.start, s.end, "subgroup significance contrast"), ...stmts],
        explanation: "An effect is reported as significant in one group but not another, with no test of the difference in the same paragraph, while a hypothesis predicts moderation. A difference in significance is not a significant difference.",
      });
    }
    out.push(...(concerns.length ? concerns : [{ rule: "R6" as const, target, applicable: true, verdict: "OK" as const, premises: [], explanation: "No subgroup-significance contrast without a test of the difference was located." }]));
  }
  return out.length ? out : [na("R6", {}, "No document with role \"paper\".")];
}

// ───────────────────────── R7 ─────────────────────────

const R7_FIELDS: (keyof HypothesisNode["fields"])[] = ["direction", "outcome", "predictor", "status", "falsification", "sesoi", "test"];
const normStr = (v: unknown) => String(v).toLowerCase().replace(/[^\p{L}\p{N}.]+/gu, " ").trim();

function r7(ctx: Ctx): Raw[] {
  const pre = ctx.graph.documents.filter((d) => d.role === "preregistration" || d.role === "stage1");
  if (!pre.length) return [na("R7", {}, "No preregistration or Stage 1 document in the graph.")];
  const preIds = new Set(pre.map((d) => d.id));
  const byId = new Map(ctx.graph.hypotheses.map((h) => [h.id, h]));
  const links = ctx.graph.links.filter((l) => {
    if (l.relation !== "correspondsTo" && l.relation !== "revises") return false;
    const a = byId.get(l.from);
    const b = byId.get(l.to);
    return !!a && !!b && preIds.has(a.documentId) !== preIds.has(b.documentId) && l.reviewStatus !== "human-rejected";
  });
  if (!links.length) return [notAssessable("R7", {}, "No correspondence links between paper and preregistration hypotheses; item alignment is not established.")];
  const out: Raw[] = [];
  for (const l of links) {
    const a = byId.get(l.from)!;
    const b = byId.get(l.to)!;
    const [paper, prereg] = preIds.has(a.documentId) ? [b, a] : [a, b];
    const target = { hypothesisId: paper.id, linkId: l.id };
    const diffs: string[] = [];
    const premises: Premise[] = [];
    let compared = 0;
    for (const f of R7_FIELDS) {
      const pv = valueOf(paper.fields[f] as EvidenceValue<unknown>);
      const rv = valueOf(prereg.fields[f] as EvidenceValue<unknown>);
      if (pv === undefined || rv === undefined) continue;
      compared++;
      if (normStr(pv) === normStr(rv)) continue;
      diffs.push(`${f}: "${String(rv)}" → "${String(pv)}"`);
      premises.push(...(fieldPremises(ctx, prereg, f, `preregistered ${f}`) ?? []), ...(fieldPremises(ctx, paper, f, `reported ${f}`) ?? []));
    }
    if (!compared) {
      out.push(notAssessable("R7", target, "No field is established on both sides of the correspondence."));
      continue;
    }
    if (!diffs.length) {
      out.push({ rule: "R7", target, applicable: true, verdict: "OK", premises: [], explanation: `${compared} compared field(s) agree.`, links: [l] });
      continue;
    }
    const ps = [statementPremise(ctx, prereg), statementPremise(ctx, paper)].filter((p): p is Premise => !!p);
    out.push({
      rule: "R7",
      target,
      applicable: true,
      verdict: "NOTE",
      premises: [...ps, ...premises],
      explanation: `Documented difference between preregistration and paper (disclosed or not): ${diffs.join("; ")}.`,
      links: [l],
    });
  }
  return out;
}

const RUNNERS: Record<RuleId, (ctx: Ctx) => Raw[]> = { R1: r1, R2: r2, R3: r3, R4: r4, R5: r5, R6: r6, R7: r7 };

// ───────────────────────── finalize ─────────────────────────

function finalize(ctx: Ctx, raw: Raw, groupIds: Map<string, string>): Assessment {
  const rule = RULE_BY_ID[raw.rule];
  const llmDependent = raw.premises.some((p) => p.source === "llm_extraction");
  let verdict = raw.applicable ? raw.verdict : null;
  let explanation = raw.explanation;
  const caps: string[] = [];
  if (isAdverse(verdict)) {
    const texts = Object.fromEntries(ctx.texts);
    const bad = raw.premises.length === 0 ? ["no premise"] : validateAnchors(raw.premises.map((p) => p.anchor), texts, { documents: ctx.graph.documents }).problems.map((p) => `${p.anchorId}: ${p.code}`);
    if (bad.length) {
      verdict = "NOT_ASSESSABLE";
      explanation = `${explanation} [Demoted: premise not anchored (${bad.join("; ")}).]`;
      caps.push("premise not anchored");
    } else {
      const c = applyCaps(verdict, { rule, llmDependent, links: raw.links ?? [] });
      verdict = c.verdict;
      caps.push(...c.capsApplied);
    }
  }
  const spans = raw.premises.map((p) => `${p.anchor.documentId}:${p.anchor.start}-${p.anchor.end}`).join(",");
  const id = `${raw.rule}:${sha256(canonicalJson({ t: raw.target, spans, e: raw.explanation })).slice(0, 16)}`;
  return {
    id,
    ruleId: raw.rule,
    ruleName: rule.name,
    ruleSetVersion: RULE_SET_VERSION,
    target: raw.target,
    applicability: raw.applicable ? "applicable" : "not_applicable",
    verdict,
    rawVerdict: raw.applicable ? raw.verdict : null,
    capsApplied: caps,
    premises: raw.premises,
    explanation,
    ...(raw.groupKey && groupIds.has(raw.groupKey) ? { groupId: groupIds.get(raw.groupKey)! } : {}),
    llmDependent,
  };
}

/**
 * Run rule set published-0.1.0 over an evidence graph. Deterministic: identical inputs give an
 * identical report (no timestamps, no randomness).
 */
export function evaluatePublished(graphInput: EvidenceGraph, options: EvaluateOptions = {}): EvaluationReport {
  const graph = GraphSchema.parse(graphInput);
  const texts = new Map<string, string>();
  const docHashes: DocumentInputHash[] = graph.documents.map((d) => {
    const t = options.texts?.[d.id];
    const matches = t !== undefined && sha256(t) === d.textSha256;
    if (matches) texts.set(d.id, t!);
    return { documentId: d.id, textSha256: d.textSha256, textSupplied: t !== undefined, textMatches: matches };
  });
  const ctx: Ctx = { graph, texts, docs: new Map(graph.documents.map((d) => [d.id, d])), anchors: new Map(graph.anchors.map((a) => [a.id, a])) };
  const rulesRun = (options.rules ?? RULES.map((r) => r.id)).filter((r, i, a) => a.indexOf(r) === i);
  for (const r of rulesRun) if (!RUNNERS[r]) throw new Error(`evaluatePublished: unknown rule ${r}`);
  const raws = rulesRun.flatMap((r) => RUNNERS[r](ctx));
  // R2 + R3 on the same claim sentence are one user-facing concern.
  const groupIds = new Map<string, string>();
  for (const r of raws) if (r.groupKey && !groupIds.has(r.groupKey)) groupIds.set(r.groupKey, `g_${sha256(r.groupKey).slice(0, 12)}`);
  const assessments = raws.map((r) => finalize(ctx, r, groupIds));
  const empty = (): Record<Verdict | "not_applicable", number> => ({ OK: 0, NOTE: 0, WARN: 0, FLAG: 0, NOT_ASSESSABLE: 0, not_applicable: 0 });
  const byVerdict = empty();
  const byRule: Record<string, Record<Verdict | "not_applicable", number>> = {};
  for (const a of assessments) {
    const k = a.verdict ?? "not_applicable";
    byVerdict[k]++;
    (byRule[a.ruleId] ??= empty())[k]++;
  }
  return {
    format: REPORT_FORMAT,
    formatVersion: REPORT_FORMAT_VERSION,
    libraryVersion: LIBRARY_VERSION,
    ruleSetVersion: RULE_SET_VERSION,
    graphFormatVersion: GRAPH_FORMAT_VERSION,
    inputHashes: { graphSha256: sha256(canonicalJson(graph)), documents: docHashes },
    rulesRun,
    assessments,
    summary: { byVerdict, byRule },
  };
}
