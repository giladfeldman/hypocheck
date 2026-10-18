/**
 * Synthetic documents and graphs for the experimental tests. All text here is written for the
 * tests; no article text is used.
 */
import { sha256 } from "../../src/index.js";
import {
  GRAPH_FORMAT,
  GRAPH_FORMAT_VERSION,
  anchorQuote,
  makeAnchor,
  occurrenceId,
  type Anchor,
  type DocumentRole,
  type EvidenceGraph,
  type GraphDocument,
  type HypothesisNode,
  type Provenance,
  type Section,
} from "../../src/experimental/index.js";

export interface SynthDoc {
  id: string;
  role: DocumentRole;
  text: string;
  sections: Section[];
}

/** Build a document from [heading, body] parts; each section starts at its heading. */
export function buildDoc(id: string, parts: [string, string][], role: DocumentRole = "paper"): SynthDoc {
  let text = "";
  const sections: Section[] = [];
  parts.forEach(([label, body], i) => {
    const start = text.length;
    text += `${label}\n\n${body}\n\n`;
    sections.push({ id: `${id}-s${i + 1}`, label, start, end: text.length });
  });
  return { id, role, text, sections };
}

export function graphDoc(d: SynthDoc, unavailable: string[] = []): GraphDocument {
  return {
    id: d.id,
    role: d.role,
    textSha256: sha256(d.text),
    extractor: { name: "synthetic", version: "1" },
    offsetUnit: "utf16",
    sections: d.sections,
    coverage: { status: "complete", readSectionIds: d.sections.map((s) => s.id), unreadSectionIds: [], skippedSectionIds: [], unavailable },
  };
}

export function emptyGraph(docs: SynthDoc[], unavailable: Record<string, string[]> = {}): EvidenceGraph {
  return {
    format: GRAPH_FORMAT,
    version: GRAPH_FORMAT_VERSION,
    createdBy: { name: "tests", version: "0" },
    documents: docs.map((d) => graphDoc(d, unavailable[d.id] ?? [])),
    studies: [{ id: "study-1", documentIds: docs.map((d) => d.id), anchorIds: [] }],
    hypotheses: [],
    anchors: [],
    decisionRules: [],
    analysisRefs: [],
    links: [],
    assessments: [],
  };
}

export const texts = (docs: SynthDoc[]) => Object.fromEntries(docs.map((d) => [d.id, d.text]));

/** Anchor a quote that must occur exactly once. */
export function anchorOnce(d: SynthDoc, quote: string): Anchor {
  const r = anchorQuote(d.text, quote, { documentId: d.id, sections: d.sections });
  if (r.status !== "unique") throw new Error(`test fixture: "${quote}" is ${r.status} in ${d.id}`);
  return r.anchors[0];
}

const notLocated = (docId: string) => ({ state: "not_located" as const, searchedDocumentIds: [docId] });

/**
 * Add a hypothesis node whose statement is `statement` (must occur once in the doc). `fields`
 * entries are [value, evidenceQuote] pairs recorded as inferred (llm) or observed (human).
 */
export function addHypothesis(
  graph: EvidenceGraph,
  d: SynthDoc,
  statement: string,
  fields: Partial<Record<keyof HypothesisNode["fields"], [string, string]>>,
  kind: Provenance["kind"] = "llm",
  label?: string,
): HypothesisNode {
  const st = anchorOnce(d, statement);
  const add = (a: Anchor) => {
    if (!graph.anchors.some((x) => x.id === a.id)) graph.anchors.push(a);
  };
  add(st);
  const base = Object.fromEntries(
    ["direction", "sidedness", "tailDirection", "status", "predictor", "outcome", "comparison", "population", "sesoi", "expectedEffect", "test", "falsification"].map((k) => [
      k,
      notLocated(d.id),
    ]),
  ) as unknown as HypothesisNode["fields"];
  for (const [k, v] of Object.entries(fields) as [keyof HypothesisNode["fields"], [string, string]][]) {
    const a = anchorOnce(d, v[1]);
    add(a);
    (base as Record<string, unknown>)[k] =
      kind === "human" ? { state: "observed", value: v[0], evidenceIds: [a.id] } : { state: "inferred", value: v[0], evidenceIds: [a.id], method: "llm:test" };
  }
  const textSha = sha256(d.text);
  const labels: HypothesisNode["labels"] = [];
  if (label) labels.push({ label, studyId: "study-1", documentId: d.id });
  const node: HypothesisNode = {
    id: occurrenceId(textSha, st.start, st.end, ""),
    labels,
    studyId: "study-1",
    documentId: d.id,
    statement: st.exact,
    statementAnchorId: st.id,
    components: [{ id: occurrenceId(textSha, st.start, st.end, "c0"), path: "c0", text: st.exact, anchorId: st.id }],
    logic: "single",
    fields: base,
    provenance: kind === "llm" ? { kind, servedModel: "test-model", promptId: "p", promptSha256: "x" } : { kind },
  };
  graph.hypotheses.push(node);
  return node;
}

export { makeAnchor };
