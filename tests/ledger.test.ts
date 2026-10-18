import { describe, expect, it } from "vitest";
import { canonicalJson, promptSha256, replayClient, type LlmClient } from "../src/index.js";
import {
  GraphSchema,
  LEDGER_PROMPT_ID,
  checkGraphReferences,
  extractLedger,
  ledgerPrompt,
  planChunks,
  validateAnchors,
  type DocumentBundle,
} from "../src/experimental/index.js";
import { buildDoc } from "./helpers/synthetic.js";

const doc = buildDoc("paper", [
  ["Introduction", "Confirmation bias is common.\n\nH1: Social rules will reduce confirmatory selections compared to descriptive rules. The test of H1 was one-tailed."],
  ["Method", "We recruited 300 adults. We expect an effect of d = 0.4. We also expect that time pressure will increase confirmatory selections."],
  ["Results", "H1 was supported."],
  ["References", "Author, A. (2020). A title. A journal."],
]);
const bundle: DocumentBundle = { documents: [{ id: doc.id, role: "paper", text: doc.text, sections: doc.sections, extractor: { name: "synthetic", version: "1" } }] };

const nulls = Object.fromEntries(
  ["first_variable_type", "second_variable_type", "comparison", "kind", "theory", "mechanism", "population", "effect_size_metric", "smallest_effect_of_interest", "expected_effect_size", "test", "falsification"].map((k) => [k, null]),
);
const item = (extra: Record<string, unknown>) => ({ ...nulls, label: null, first_variable: "A", association: "increased", second_variable: "B", ...extra });

const REPLY = JSON.stringify({
  hypotheses: [
    item({
      label: "H1",
      quote: "Social rules will reduce confirmatory selections compared to descriptive rules.",
      first_variable: "Social rules",
      association: "decreased",
      second_variable: "confirmatory selections",
      comparison: "descriptive rules",
      kind: "confirmatory",
      expected_effect_size: "d = 0.4",
    }),
    item({ quote: "We also expect that time pressure will increase confirmatory selections.", first_variable: "time pressure", kind: "focal" }),
    item({ quote: "Time pressure strongly raises bias.", kind: "exploratory" }),
  ],
});

const fixedClient = (text: string): LlmClient & { calls: number } => {
  const c = {
    calls: 0,
    async complete() {
      c.calls++;
      return { text, servedModel: "recorded-model" };
    },
  };
  return c;
};

describe("planChunks", () => {
  it("groups sections under the budget and skips references by default", () => {
    const { chunks, skipped } = planChunks(doc, 10_000);
    expect(skipped).toEqual(["paper-s4"]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].sectionIds).toEqual(["paper-s1", "paper-s2", "paper-s3"]);
  });
  it("has no fixed 30,000-character cut: a 70,000-character document is read whole in budget-sized chunks", () => {
    const para = "Participants completed many trials of the task in the lab. ".repeat(20);
    const big = buildDoc("big", [["Results", Array.from({ length: 60 }, () => para).join("\n\n")]]);
    expect(big.text.length).toBeGreaterThan(70_000);
    const { chunks } = planChunks(big, 30_000);
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    for (const c of chunks) expect(c.end - c.start).toBeLessThanOrEqual(30_000);
    expect(chunks[0].start).toBe(0);
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].start).toBe(chunks[i - 1].end);
    expect(chunks[chunks.length - 1].end).toBe(big.text.length);
  });
  it("refuses a meaningless budget", () => {
    expect(() => planChunks(doc, 10)).toThrow(/budgetChars/);
  });
});

describe("extractLedger with a recorded reply", () => {
  it("anchors verified quotes, returns unanchored ones, never defaults confirmatory, and records provenance", async () => {
    const client = replayClient([{ promptId: LEDGER_PROMPT_ID, promptSha256: "*", response: { text: REPLY, servedModel: "recorded-model" } }], { matchBy: "promptId" });
    const { graph, calls, unanchored, warnings } = await extractLedger(bundle, client, { budgetChars: 10_000 });

    expect(calls).toHaveLength(1);
    const chunkText = doc.text.slice(calls[0].chunk.start, calls[0].chunk.end);
    const built = ledgerPrompt(chunkText);
    expect(calls[0]).toMatchObject({ promptId: LEDGER_PROMPT_ID, promptSha256: promptSha256(built.system, built.prompt), servedModel: "recorded-model", status: "ok", proposed: 3, anchored: 2 });
    expect(client.calls[0].system).toBe(built.system);
    expect(chunkText).not.toContain("Author, A. (2020)");

    expect(unanchored.map((u) => u.quote)).toEqual(["Time pressure strongly raises bias."]);
    expect(graph.hypotheses).toHaveLength(2);
    const [h1, h2] = graph.hypotheses;
    expect(doc.text.slice(graph.anchors.find((a) => a.id === h1.statementAnchorId)!.start, graph.anchors.find((a) => a.id === h1.statementAnchorId)!.end)).toBe(h1.statement);
    expect(h1.labels.map((l) => l.label)).toEqual(["H1"]);
    expect(h1.fields.direction).toMatchObject({ state: "inferred", value: "negative" });
    // "confirmatory" is the prompt's default, not evidence: the text never says it.
    expect(h1.fields.status.state).toBe("not_located");
    // "focal" without focal/primary language in the document is dropped too.
    expect(h2.fields.status.state).toBe("not_located");
    // Sidedness found deterministically in the statement's paragraph; unstated stays not_located.
    expect(h1.fields.sidedness).toMatchObject({ state: "inferred", value: "one" });
    expect(h2.fields.sidedness.state).toBe("not_located");
    // Expected effect is never a SESOI.
    expect(h1.fields.sesoi.state).toBe("not_located");
    expect(h1.fields.expectedEffect).toMatchObject({ state: "inferred", value: "d = 0.4" });
    expect(h1.provenance).toMatchObject({ kind: "llm", servedModel: "recorded-model", promptId: LEDGER_PROMPT_ID });
    expect(warnings).toEqual([]);

    expect(graph.documents[0].coverage).toEqual({ status: "complete", readSectionIds: ["paper-s1", "paper-s2", "paper-s3"], unreadSectionIds: [], skippedSectionIds: ["paper-s4"], unavailable: [] });
    expect(GraphSchema.safeParse(graph).success).toBe(true);
    expect(checkGraphReferences(graph)).toEqual([]);
    expect(validateAnchors(graph.anchors, { paper: doc.text }, { documents: graph.documents })).toEqual({ valid: true, problems: [] });
  });

  it("is deterministic for the same bundle and recorded reply", async () => {
    const a = await extractLedger(bundle, fixedClient(REPLY), { budgetChars: 10_000 });
    const b = await extractLedger(bundle, fixedClient(REPLY), { budgetChars: 10_000 });
    expect(canonicalJson(a.graph)).toBe(canonicalJson(b.graph));
  });

  it("records failed and skipped calls as unread coverage, never as empty success", async () => {
    const failing: LlmClient = {
      async complete() {
        throw new Error("quota");
      },
    };
    const r = await extractLedger(bundle, failing, { budgetChars: 10_000 });
    expect(r.calls[0]).toMatchObject({ status: "client_error", error: "quota" });
    expect(r.graph.documents[0].coverage.status).toBe("none");
    expect(r.graph.documents[0].coverage.unreadSectionIds).toEqual(["paper-s1", "paper-s2", "paper-s3"]);

    const garbage = await extractLedger(bundle, fixedClient("I cannot help."), { budgetChars: 10_000 });
    expect(garbage.calls[0].status).toBe("unusable_reply");
    expect(garbage.graph.hypotheses).toEqual([]);

    const filler = "Participants completed the task in a quiet room. ".repeat(10);
    const long = buildDoc("long", [["Introduction", filler], ["Method", filler], ["Results", filler]]);
    const small = await extractLedger(
      { documents: [{ id: "long", role: "paper", text: long.text, sections: long.sections, extractor: { name: "s", version: "1" } }] },
      fixedClient('{"hypotheses":[]}'),
      { budgetChars: 600, maxCalls: 1 },
    );
    expect(small.calls.map((c) => c.status)).toEqual(["ok", "not_run", "not_run"]);
    expect(small.graph.documents[0].coverage).toMatchObject({ status: "partial", readSectionIds: ["long-s1"], unreadSectionIds: ["long-s2", "long-s3"] });
  });

  it("status 'confirmatory' is recorded only when the document calls the hypothesis confirmatory", async () => {
    const d2 = buildDoc("p2", [["Hypotheses", "Our confirmatory hypothesis is as follows. H1: Social rules will reduce confirmatory selections compared to descriptive rules."]]);
    const r = await extractLedger(
      { documents: [{ id: "p2", role: "paper", text: d2.text, sections: d2.sections, extractor: { name: "s", version: "1" } }] },
      fixedClient(REPLY),
      { budgetChars: 10_000 },
    );
    expect(r.graph.hypotheses[0].fields.status).toMatchObject({ state: "inferred", value: "confirmatory" });
  });

  it("merges a repeated proposal of the same span and says so", async () => {
    const dup = JSON.parse(REPLY);
    dup.hypotheses.push(dup.hypotheses[0]);
    const r = await extractLedger(bundle, fixedClient(JSON.stringify(dup)), { budgetChars: 10_000 });
    expect(r.graph.hypotheses).toHaveLength(2);
    expect(r.warnings.join("\n")).toMatch(/merged/);
  });
});
