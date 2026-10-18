import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CRITERIA,
  LIBRARY_VERSION,
  PROMPT_IDS,
  PROMPT_VERSION,
  aiCoach,
  aiCritique,
  aiExtract,
  assessAuthoring,
  canonicalJson,
  checkHypothesis,
  confBiasExample,
  critiquePrompt,
  emptyProject,
  extractionPrompt,
  extractionToProject,
  labelHypotheses,
  newHypothesis,
  newVariable,
  parseExtraction,
  promptSha256,
  recordingClient,
  renderPromptText,
  replayClient,
  scoreProject,
  sequentialIds,
  sha256,
  type LlmClient,
} from "../src/index.js";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("sha256 and canonicalJson", () => {
  it.each(["", "abc", "Résumé 😀 — “quotes”", "x".repeat(1000), "a".repeat(55), "a".repeat(56), "a".repeat(64)])("matches node:crypto for %#", (s) => {
    expect(sha256(s)).toBe(createHash("sha256").update(s, "utf8").digest("hex"));
  });
  it("sorts keys at every level, drops undefined members, refuses non-finite numbers", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: undefined } })).toBe('{"a":{"d":[1,{"y":2,"z":1}]},"b":1}');
    expect(() => canonicalJson({ x: Number.NaN })).toThrow();
  });
});

describe("prompts are byte-identical to the Hypothesizer prompt files", () => {
  // Same derivation as Hypothesizer's scripts/export-prompts.ts.
  it("extract.txt", () => {
    const ex = extractionPrompt("{{DOCUMENT}}");
    const user = ex.prompt.replace(/Sentences that look like hypotheses[\s\S]*?\n\n(?=DOCUMENT:)/, "");
    expect(`# prompt_version ${PROMPT_VERSION}\n# SYSTEM\n${ex.system}\n# USER\n${user}\n`).toBe(read("./fixtures/prompts/extract.txt"));
  });
  it("critique.txt", () => {
    const c = critiquePrompt(emptyProject(), newHypothesis(), []);
    const user = c.prompt
      .replace(/Research question: .*\n/, "")
      .replace(/HYPOTHESIS:\n<<<\n[\s\S]*?\n>>>/, "HYPOTHESIS:\n<<<\n{{HYPOTHESIS}}\n>>>")
      .replace(/Automatic checks that did not pass:\n[\s\S]*?\n\n/, "");
    expect(`# prompt_version ${PROMPT_VERSION}\n# SYSTEM\n${c.system}\n# USER\n${user}\n`).toBe(read("./fixtures/prompts/critique.txt"));
  });
  it("criteria.json", () => {
    expect(JSON.stringify(CRITERIA.map(({ id, number, title }) => ({ id, number, title })), null, 2) + "\n").toBe(read("./fixtures/prompts/criteria.json"));
  });
  it("promptSha256 hashes the published file layout (the file minus its version line)", () => {
    const ex = extractionPrompt("{{DOCUMENT}}");
    const user = ex.prompt.replace(/Sentences that look like hypotheses[\s\S]*?\n\n(?=DOCUMENT:)/, "");
    const file = read("./fixtures/prompts/extract.txt");
    expect(renderPromptText(ex.system, user)).toBe(file.slice(file.indexOf("\n") + 1));
    expect(promptSha256(ex.system, user)).toBe(sha256(file.slice(file.indexOf("\n") + 1)));
  });
  it("the document cut defaults to the app's 30,000 characters and is configurable", () => {
    const doc = "x".repeat(40_000);
    expect(extractionPrompt(doc).prompt).toContain(`<<<\n${"x".repeat(30_000)}\n>>>`);
    expect(extractionPrompt(doc, { maxChars: 35_000 }).prompt).toContain(`<<<\n${"x".repeat(35_000)}\n>>>`);
  });
});

describe("deterministic ids by injection; defaults unchanged", () => {
  it("sequentialIds gives v1, v2 / h1, h2", () => {
    const idGen = sequentialIds();
    expect([newVariable({}, { idGen }).id, newVariable({}, { idGen }).id, newHypothesis({}, { idGen }).id]).toEqual(["v1", "v2", "h1"]);
  });
  it("the default generator keeps the existing format", () => {
    expect(newVariable().id).toMatch(/^v[0-9a-z]+$/);
    expect(newHypothesis().id).not.toBe(newHypothesis().id);
  });
  it("extractionToProject is deterministic with an injected generator", () => {
    const reply = '{"hypotheses":[{"label":"H1","quote":"A raises B.","first_variable":"A","association":"increased","second_variable":"B","first_variable_type":null,"second_variable_type":null,"comparison":null,"kind":null,"theory":null,"mechanism":null,"population":null,"effect_size_metric":null,"smallest_effect_of_interest":null,"test":null,"falsification":null}]}';
    const a = extractionToProject("A raises B.", parseExtraction(reply)!, { idGen: sequentialIds() });
    const b = extractionToProject("A raises B.", parseExtraction(reply)!, { idGen: sequentialIds() });
    expect(canonicalJson(a)).toBe(canonicalJson(b));
    expect(a.project.hypotheses[0].id).toBe("h1");
  });
  it("schemaVersion 1 projects load unchanged", () => {
    const p = confBiasExample();
    expect(p.schemaVersion).toBe(1);
    expect(p.variables[0].id).toBe("v1");
  });
});

describe("assessAuthoring", () => {
  it("scoreProject is the same function", () => {
    expect(scoreProject).toBe(assessAuthoring);
    const p = confBiasExample();
    const all = labelHypotheses(p.hypotheses);
    expect(assessAuthoring(p).cards[0].results).toEqual(checkHypothesis(p, all[0], all));
  });
});

describe("AI tasks through an injected client", () => {
  const REPLY = '{"hypotheses":[{"label":"H1","quote":"A raises B in adults.","first_variable":"A","association":"increased","second_variable":"B","first_variable_type":null,"second_variable_type":null,"comparison":null,"kind":null,"theory":null,"mechanism":null,"population":null,"effect_size_metric":null,"smallest_effect_of_interest":null,"test":null,"falsification":null}]}';
  it("aiExtract records promptId, prompt hash and served model, and passes the system prompt", async () => {
    const built = extractionPrompt("A raises B in adults.");
    const sha = promptSha256(built.system, built.prompt);
    const client = replayClient([{ promptId: PROMPT_IDS.extract, promptSha256: sha, response: { text: REPLY, servedModel: "m-1" } }]);
    const r = await aiExtract("A raises B in adults.", client, { idGen: sequentialIds() });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.provenance).toEqual({ promptId: PROMPT_IDS.extract, promptSha256: sha, servedModel: "m-1", libraryVersion: LIBRARY_VERSION });
    expect(r.model).toBe("m-1");
    expect(r.items[0]).toMatchObject({ hypothesisId: "h1", quoteVerified: true });
    expect(client.calls[0]).toMatchObject({ system: built.system, prompt: built.prompt, responseFormat: "json", maxTokens: 6000 });
    expect(client.calls[0].accept?.(REPLY)).toBe(true);
    expect(client.calls[0].accept?.("nope")).toBe(false);
  });
  it("an unusable reply and a client error are typed failures, not empty successes", async () => {
    const bad = await aiExtract("doc", replayClient([{ promptId: PROMPT_IDS.extract, promptSha256: "", response: { text: "sorry" } }], { matchBy: "promptId" }));
    expect(bad).toMatchObject({ ok: false, reason: "unusable_reply" });
    const thrower: LlmClient = { complete: async () => Promise.reject(new Error("429")) };
    expect(await aiCoach(emptyProject(), "variables", thrower)).toMatchObject({ ok: false, reason: "client_error", error: "429" });
  });
  it("replayClient refuses a request it has no recording for", async () => {
    await expect(replayClient([]).complete({ prompt: "p", promptId: "x", promptSha256: "y" })).rejects.toThrow(/no recording/);
  });
  it("recordingClient keeps exchanges that replay identically", async () => {
    const live: LlmClient = { complete: async () => ({ text: '{"suggestions":[],"improved_statement":"S."}', servedModel: "live" }) };
    const rec = recordingClient(live);
    const p = confBiasExample();
    const h = p.hypotheses[2];
    const first = await aiCritique(p, h, [], rec);
    const again = await aiCritique(p, h, [], replayClient(rec.recordings));
    expect(again).toEqual(first);
    expect(first.provenance.promptId).toBe(PROMPT_IDS.critique);
  });
});

describe("package metadata", () => {
  const pkg = JSON.parse(read("../package.json"));
  it("LIBRARY_VERSION equals package.json, CITATION.cff and the newest CHANGELOG entry", () => {
    expect(LIBRARY_VERSION).toBe(pkg.version);
    expect(read("../CITATION.cff")).toMatch(new RegExp(`^version: "${pkg.version}"`, "m"));
    expect(read("../CHANGELOG.md")).toMatch(new RegExp(`^## v?${pkg.version.replace(/\./g, "\\.")}\\b`, "m"));
  });
  it("the core entry depends only on zod; docx and exceljs are optional peers", () => {
    expect(Object.keys(pkg.dependencies)).toEqual(["zod"]);
    expect(pkg.peerDependenciesMeta).toEqual({ docx: { optional: true }, exceljs: { optional: true } });
  });
  it("the bundled example .ts module equals example-confbias.json", async () => {
    const { CONFBIAS_EXAMPLE_DATA } = await import("../src/hypothesis/example-confbias.data.js");
    expect(CONFBIAS_EXAMPLE_DATA).toEqual(JSON.parse(read("../src/hypothesis/example-confbias.json")));
  });
});
