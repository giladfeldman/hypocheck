/**
 * extractLedger: build an evidence graph of the hypotheses a set of documents states, with an
 * injected LLM proposing candidates and deterministic code anchoring every one of them.
 *
 * - Section-wise chunking under a host-set character budget (no fixed cut-off); coverage records
 *   which sections were read, skipped by policy, or left unread because a call failed.
 * - A proposed hypothesis enters the graph only if its quote anchors to the source text; the rest
 *   are returned as `unanchored`, never silently dropped and never paraphrased into the graph.
 * - No field defaults: a status the model calls "confirmatory" without the text saying so is
 *   "not_located"; LLM-proposed values are "inferred", never "observed".
 * - Every call records its promptId and the SHA-256 of the instantiated prompt.
 *
 * The prompt is, for this first version, the Hypothesizer extraction prompt text applied to one
 * chunk, recorded under its own id LEDGER_PROMPT_ID.
 */
import { sha256 } from "../hash.js";
import { promptSha256, type LlmClient } from "../llm.js";
import { LIBRARY_VERSION } from "../version.js";
import { associationById } from "../hypothesis/vocab.js";
import { extractionPrompt, parseExtraction, type Extracted } from "../ai/tasks.js";
import { anchorQuote, makeAnchor } from "./anchor.js";
import {
  GRAPH_FORMAT,
  GRAPH_FORMAT_VERSION,
  occurrenceId,
  type Anchor,
  type CanonicalSection,
  type DocumentRole,
  type EvidenceGraph,
  type EvidenceValue,
  type Extractor,
  type GraphDocument,
  type HypothesisNode,
  type HypothesisStatus,
  type Provenance,
  type Section,
} from "./graph.js";
import { findStatedSidedness, labelInventory, sectionClass } from "./textscan.js";

export const LEDGER_PROMPT_ID = "hypocheck-ledger-extract@0.1.0";

export interface BundleDocument {
  id: string;
  role: DocumentRole;
  /** The exact flat text all offsets refer to. Never stored in the graph (only its hash is). */
  text: string;
  doi?: string;
  /** Section ranges over `text`. Without them the whole text is one section. */
  sections?: Section[];
  extractor: Extractor;
  /** Materials the document refers to that the host could not supply. */
  unavailable?: string[];
}

export interface DocumentBundle {
  documents: BundleDocument[];
  /** Study id used for every hypothesis (study detection is not automated in 0.1.0). */
  studyId?: string;
  studyLabel?: string;
}

export interface ExtractLedgerOptions {
  /** Maximum characters of document text per model call. Required: the host decides the budget. */
  budgetChars: number;
  /** Section classes not read (default ["references"]). */
  skipSectionClasses?: CanonicalSection[];
  /** Stop after this many calls (remaining sections are recorded as unread). */
  maxCalls?: number;
  signal?: AbortSignal;
}

export interface LedgerChunk {
  id: string;
  documentId: string;
  start: number;
  end: number;
  sectionIds: string[];
}

export interface LedgerCall {
  chunk: LedgerChunk;
  promptId: string;
  promptSha256: string;
  servedModel: string | null;
  status: "ok" | "unusable_reply" | "client_error" | "not_run";
  error?: string;
  /** Hypotheses the reply proposed, and how many anchored. */
  proposed: number;
  anchored: number;
}

export interface UnanchoredItem {
  documentId: string;
  chunkId: string;
  quote: string;
  label: string;
  reason: "quote_not_found";
}

export interface LedgerResult {
  graph: EvidenceGraph;
  calls: LedgerCall[];
  unanchored: UnanchoredItem[];
  warnings: string[];
}

/** Split a document into model-sized chunks along section (then paragraph, then sentence) boundaries. */
export function planChunks(
  doc: Pick<BundleDocument, "id" | "text" | "sections">,
  budgetChars: number,
  skipSectionClasses: CanonicalSection[] = ["references"],
): { chunks: LedgerChunk[]; sections: Section[]; skipped: string[] } {
  if (!(budgetChars >= 500)) throw new Error("planChunks: budgetChars must be at least 500");
  const sections: Section[] =
    doc.sections && doc.sections.length
      ? [...doc.sections].sort((a, b) => a.start - b.start)
      : [{ id: "body", label: "(whole text)", start: 0, end: doc.text.length }];
  const skipped = sections.filter((s) => skipSectionClasses.includes(sectionClass(s))).map((s) => s.id);
  const pieces: { start: number; end: number; sectionId: string }[] = [];
  for (const s of sections) {
    if (skipped.includes(s.id)) continue;
    const end = Math.min(s.end, doc.text.length);
    let st = s.start;
    while (end - st > budgetChars) {
      const window = doc.text.slice(st, st + budgetChars);
      let cut = window.lastIndexOf("\n\n");
      if (cut < budgetChars / 3) cut = Math.max(window.lastIndexOf(". "), window.lastIndexOf(".\n"));
      cut = cut < budgetChars / 3 ? budgetChars : cut + 1;
      pieces.push({ start: st, end: st + cut, sectionId: s.id });
      st += cut;
    }
    if (end > st) pieces.push({ start: st, end, sectionId: s.id });
  }
  const chunks: LedgerChunk[] = [];
  let cur: LedgerChunk | null = null;
  for (const p of pieces) {
    if (cur && p.start === cur.end && p.end - cur.start <= budgetChars) {
      cur.end = p.end;
      if (!cur.sectionIds.includes(p.sectionId)) cur.sectionIds.push(p.sectionId);
      continue;
    }
    cur = { id: `${doc.id}#${chunks.length + 1}`, documentId: doc.id, start: p.start, end: p.end, sectionIds: [p.sectionId] };
    chunks.push(cur);
  }
  return { chunks, sections, skipped };
}

/** The prompt for one chunk: the extraction prompt text over exactly that chunk. */
export function ledgerPrompt(chunkText: string): { system: string; prompt: string } {
  return extractionPrompt(chunkText, { maxChars: Number.POSITIVE_INFINITY });
}

/** The document itself calls a hypothesis or test confirmatory ("confirmatory selections" does not count). */
export const CONFIRMATORY_STATED_RE =
  /\bconfirmatory\s+(?:hypothes[ie]s|tests?|analys[ie]s|predictions?|research\s+questions?)\b|\b(?:is|are|was|were)\s+(?:a\s+)?confirmatory\b/i;

const notLocated = (docId: string): EvidenceValue<never> => ({ state: "not_located", searchedDocumentIds: [docId] });

function normLabel(raw: string): string | null {
  const inv = labelInventory(raw);
  return inv.length === 1 ? inv[0].label : null;
}

/**
 * Extract a hypothesis ledger from a document bundle. Pure apart from the injected client:
 * the same bundle, options and recorded replies give the same graph.
 */
export async function extractLedger(bundle: DocumentBundle, llm: LlmClient, options: ExtractLedgerOptions): Promise<LedgerResult> {
  const studyId = bundle.studyId ?? "study-1";
  const warnings: string[] = [];
  const calls: LedgerCall[] = [];
  const unanchored: UnanchoredItem[] = [];
  const anchors = new Map<string, Anchor>();
  const hypotheses: HypothesisNode[] = [];
  const documents: GraphDocument[] = [];
  const seenSpans = new Set<string>();
  let callsMade = 0;

  for (const doc of bundle.documents) {
    const textSha256 = sha256(doc.text);
    const { chunks, sections, skipped } = planChunks(doc, options.budgetChars, options.skipSectionClasses ?? ["references"]);
    const read = new Set<string>();
    const unread = new Set<string>();
    const namesFocal = /\b(focal|primary|main|central|key)\s+(hypothes[ie]s|prediction)/i.test(doc.text);

    for (const chunk of chunks) {
      if (options.maxCalls !== undefined && callsMade >= options.maxCalls) {
        chunk.sectionIds.forEach((s) => unread.add(s));
        calls.push({ chunk, promptId: LEDGER_PROMPT_ID, promptSha256: "", servedModel: null, status: "not_run", proposed: 0, anchored: 0 });
        continue;
      }
      callsMade++;
      const chunkText = doc.text.slice(chunk.start, chunk.end);
      const built = ledgerPrompt(chunkText);
      const sha = promptSha256(built.system, built.prompt);
      const call: LedgerCall = { chunk, promptId: LEDGER_PROMPT_ID, promptSha256: sha, servedModel: null, status: "ok", proposed: 0, anchored: 0 };
      calls.push(call);
      let parsed: Extracted | null = null;
      try {
        const res = await llm.complete({
          system: built.system,
          prompt: built.prompt,
          promptId: LEDGER_PROMPT_ID,
          promptSha256: sha,
          maxTokens: 6000,
          responseFormat: "json",
          accept: (t) => parseExtraction(t) !== null,
          signal: options.signal,
        });
        call.servedModel = res.servedModel ?? null;
        parsed = parseExtraction(res.text);
        if (!parsed) call.status = "unusable_reply";
      } catch (e) {
        if (options.signal?.aborted) throw e;
        call.status = "client_error";
        call.error = e instanceof Error ? e.message : String(e);
      }
      if (!parsed) {
        chunk.sectionIds.forEach((s) => unread.add(s));
        continue;
      }
      chunk.sectionIds.forEach((s) => read.add(s));
      call.proposed = parsed.hypotheses.length;
      const provenance: Provenance = {
        kind: "llm",
        servedModel: call.servedModel,
        promptId: LEDGER_PROMPT_ID,
        promptSha256: sha,
        tool: { name: "hypocheck", version: LIBRARY_VERSION },
      };
      const method = `llm:${LEDGER_PROMPT_ID}`;
      const within = { start: chunk.start, end: chunk.end };

      for (const x of parsed.hypotheses) {
        const found = anchorQuote(doc.text, x.quote, { documentId: doc.id, within, sections });
        if (found.status === "not_found") {
          unanchored.push({ documentId: doc.id, chunkId: chunk.id, quote: x.quote, label: x.label, reason: "quote_not_found" });
          continue;
        }
        if (found.status === "ambiguous")
          warnings.push(
            `${chunk.id}: quote occurs ${found.anchors.length} times (offsets ${found.anchors.map((a) => a.start).join(", ")}); the first occurrence was used.`,
          );
        const st = found.anchors[0];
        const spanKey = `${studyId}:${doc.id}:${st.start}:${st.end}`;
        if (seenSpans.has(spanKey)) {
          warnings.push(`${chunk.id}: a second proposal for the span at ${st.start}–${st.end} was merged into the first.`);
          continue;
        }
        seenSpans.add(spanKey);
        call.anchored++;
        anchors.set(st.id, st);

        const located = (value: string): EvidenceValue<string> => {
          if (!value) return notLocated(doc.id);
          const a = anchorQuote(doc.text, value, { documentId: doc.id, within, sections, minNormalizedLength: 3 });
          if (a.status === "not_found") return { state: "inferred", value, evidenceIds: [], method: `${method}; value not located verbatim` };
          anchors.set(a.anchors[0].id, a.anchors[0]);
          return { state: "inferred", value, evidenceIds: [a.anchors[0].id], method: `${method}; value located verbatim` };
        };

        const assoc = associationById(x.association);
        const direction: HypothesisNode["fields"]["direction"] = assoc
          ? { state: "inferred", value: assoc.direction, evidenceIds: [st.id], method }
          : notLocated(doc.id);

        // Status: never a default. "confirmatory" only when the statement's paragraph says so.
        const paraEnd = (() => {
          const i = doc.text.indexOf("\n\n", st.end);
          return i < 0 || i > chunk.end ? chunk.end : i;
        })();
        const paraStart = (() => {
          const i = doc.text.lastIndexOf("\n\n", st.start);
          return i < chunk.start ? chunk.start : i + 2;
        })();
        let status: HypothesisNode["fields"]["status"] = notLocated(doc.id);
        const kind = x.kind.toLowerCase();
        if (kind === "focal" && namesFocal) status = { state: "inferred", value: "focal", evidenceIds: [st.id], method };
        else if (kind === "exploratory" || kind === "auxiliary" || kind === "manipulation_check")
          status = { state: "inferred", value: kind as HypothesisStatus, evidenceIds: [st.id], method };
        else if (CONFIRMATORY_STATED_RE.test(doc.text.slice(paraStart, paraEnd)))
          status = { state: "inferred", value: "confirmatory", evidenceIds: [st.id], method: `${method}; "confirmatory" stated in the paragraph` };

        // Sidedness: deterministic, from the statement's own paragraph; unstated stays not_located.
        const sided = findStatedSidedness(doc.text.slice(paraStart, paraEnd));
        let sidedness: HypothesisNode["fields"]["sidedness"] = notLocated(doc.id);
        const kinds = new Set(sided.map((s) => s.sided));
        const sidedAnchors = sided.map((s) => makeAnchor(doc.text, doc.id, paraStart + s.start, paraStart + s.end, { sections }));
        sidedAnchors.forEach((a) => anchors.set(a.id, a));
        if (kinds.size === 1)
          sidedness = {
            state: "inferred",
            value: sided[0].sided,
            evidenceIds: sidedAnchors.map((a) => a.id),
            method: "deterministic: sidedness stated in the statement's paragraph",
          };
        else if (kinds.size > 1)
          sidedness = {
            state: "conflicting",
            alternatives: (["one", "two"] as const).map((v) => ({
              value: v,
              evidenceIds: sidedAnchors.filter((_, i) => sided[i].sided === v).map((a) => a.id),
            })),
          };

        // Labels: only an author label found next to the statement.
        const labels: HypothesisNode["labels"] = [];
        const want = x.label ? normLabel(x.label) : null;
        if (want) {
          const winStart = Math.max(chunk.start, st.start - 80);
          const occ = labelInventory(doc.text.slice(winStart, st.end)).find((o) => o.label === want);
          if (occ) {
            const la = makeAnchor(doc.text, doc.id, winStart + occ.start, winStart + occ.end, { sections });
            anchors.set(la.id, la);
            labels.push({ label: want, studyId, documentId: doc.id, anchorId: la.id });
          } else warnings.push(`${chunk.id}: label "${x.label}" proposed for the span at ${st.start} was not found next to it and was not recorded.`);
        }

        const id = occurrenceId(textSha256, st.start, st.end, "");
        hypotheses.push({
          id,
          labels,
          studyId,
          documentId: doc.id,
          statement: st.exact,
          statementAnchorId: st.id,
          components: [{ id: occurrenceId(textSha256, st.start, st.end, "c0"), path: "c0", text: st.exact, anchorId: st.id }],
          logic: "single",
          fields: {
            direction,
            sidedness,
            tailDirection: { state: "not_supplied", reason: `not extracted by ${LEDGER_PROMPT_ID}` },
            status,
            predictor: located(x.first_variable),
            outcome: located(x.second_variable),
            comparison: located(x.comparison),
            population: located(x.population),
            sesoi: located(x.smallest_effect_of_interest),
            expectedEffect: located(x.expected_effect_size),
            test: located(x.test),
            falsification: located(x.falsification),
          },
          provenance,
        });
      }
    }

    const selected = sections.filter((s) => !skipped.includes(s.id)).map((s) => s.id);
    const unreadIds = selected.filter((s) => unread.has(s) || !read.has(s));
    documents.push({
      id: doc.id,
      ...(doc.doi ? { doi: doc.doi } : {}),
      role: doc.role,
      textSha256,
      extractor: doc.extractor,
      offsetUnit: "utf16",
      sections,
      coverage: {
        status: unreadIds.length === 0 ? "complete" : read.size ? "partial" : "none",
        readSectionIds: selected.filter((s) => read.has(s) && !unread.has(s)),
        unreadSectionIds: unreadIds,
        skippedSectionIds: skipped,
        unavailable: doc.unavailable ?? [],
      },
    });
  }

  const graph: EvidenceGraph = {
    format: GRAPH_FORMAT,
    version: GRAPH_FORMAT_VERSION,
    createdBy: { name: "hypocheck", version: LIBRARY_VERSION },
    documents,
    studies: [{ id: studyId, ...(bundle.studyLabel ? { label: bundle.studyLabel } : {}), documentIds: documents.map((d) => d.id), anchorIds: [] }],
    hypotheses,
    anchors: [...anchors.values()].sort((a, b) => a.documentId.localeCompare(b.documentId) || a.start - b.start || a.end - b.end),
    decisionRules: [],
    analysisRefs: [],
    links: [],
    assessments: [],
  };
  return { graph, calls, unanchored, warnings };
}
