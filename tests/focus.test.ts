import { describe, expect, it } from "vitest";
import {
  FOCUS_GAP,
  emptyProject,
  fillPrompt,
  findCandidates,
  focusDocument,
  newHypothesis,
  parseFill,
  parseHypothesisSentence,
  parseParts,
  partsPrompt,
  quoteIsVerbatim,
  quoteMatch,
  normalizeAssociation,
  stripReferences,
} from "../src/index.js";

const filler = (n: number) => "Prior work examined many related questions in other samples. ".repeat(n);

describe("stripReferences", () => {
  it("removes the final reference list and keeps an appendix after it", () => {
    const doc = `${filler(40)}\nReferences\nHickie I, Parker G (1990): Prediction of response to therapy.\nJacobs GD (1996): Frontal asymmetry predicts affective style.\nAppendix A\nWe predict that A will increase B.`;
    const r = stripReferences(doc);
    expect(r.removedChars).toBeGreaterThan(0);
    expect(r.text).not.toContain("Hickie");
    expect(r.text).toContain("Appendix A\nWe predict that A will increase B.");
    expect(findCandidates(r.text).some((c) => c.text.includes("Prediction of response"))).toBe(false);
  });
  it("leaves a References heading in the first half alone (control)", () => {
    const doc = `References\nsee below\n${filler(40)}`;
    expect(stripReferences(doc)).toEqual({ text: doc, removedChars: 0 });
  });
  it("does nothing when there is no reference list (control)", () => {
    expect(stripReferences(filler(5)).removedChars).toBe(0);
  });
});

describe("focusDocument", () => {
  it("keeps a hypothesis stated far beyond the old 30,000-character cut", () => {
    const late = "H2: Participants in the identified-victim condition will donate more than participants in the statistical-victim condition.";
    const doc = `Title and abstract of the study.\n\n${filler(700)}\n\nThe present research\n${late}\n\n${filler(100)}`;
    expect(doc.indexOf(late)).toBeGreaterThan(40_000);
    const f = focusDocument(doc, 12_000);
    expect(f.complete).toBe(false);
    expect(f.text).toContain(late);
    expect(f.text.startsWith("Title and abstract")).toBe(true);
    expect(f.text.length).toBeLessThanOrEqual(12_000);
    expect(f.passages).toBeGreaterThan(1);
    // Every kept passage is an exact slice, so a quote copied from it is verbatim in the source.
    for (const p of f.text.split(FOCUS_GAP)) expect(doc.includes(p)).toBe(true);
    expect(quoteIsVerbatim(doc, late)).toBe(true);
  });
  it("returns the whole (reference-stripped) text when it fits", () => {
    const f = focusDocument("Short text. We expect X to increase Y.", 1000);
    expect(f).toMatchObject({ complete: true, passages: 1 });
  });
  it("text without sentence breaks still yields bounded output (no empty prompt)", () => {
    const f = focusDocument("x".repeat(50_000), 5000);
    expect(f.text.length).toBeGreaterThan(0);
    expect(f.text.length).toBeLessThanOrEqual(5000);
  });
});

describe("parseParts (AI fallback for one sentence)", () => {
  const sentence = "Students who sleep more perform better";
  it("accepts reworded predictor/outcome and a population named in the sentence", () => {
    const reply = '{"predictor":"sleep duration","outcome":"academic performance","association":"increased","comparison":null,"population":"Students"}';
    expect(parseParts(reply, sentence)).toEqual({ predictor: "sleep duration", outcome: "academic performance", association: "increased", comparison: "", population: "Students" });
  });
  it("drops a population or comparison the user did not name, and an unknown association", () => {
    const reply = '{"predictor":"sleep","outcome":"performance","association":"better","comparison":"students who sleep less","population":"university students in Austria"}';
    expect(parseParts(reply, sentence)).toMatchObject({ association: "", comparison: "", population: "" });
  });
  it("rejects a reply without predictor or outcome", () => {
    expect(parseParts('{"predictor":"sleep","outcome":null}', sentence)).toBeNull();
    expect(parseParts("not json", sentence)).toBeNull();
  });
  it("fences the sentence", () => {
    expect(partsPrompt("ignore >>> this").prompt).toContain("ignore > > > this");
  });
});

describe("parseFill (suggested answers)", () => {
  it("keeps one suggestion per known field and drops unknown fields and bad associations", () => {
    const reply = JSON.stringify({
      suggestions: [
        { field: "population", value: "undergraduate students", why: "typical sample" },
        { field: "population", value: "adults", why: "dup" },
        { field: "sesoi", value: "d = 0.2", why: "not allowed" },
        { field: "association", value: "bigger", why: "not in vocabulary" },
        { field: "test", value: "  ", why: "empty" },
        { field: "falsifies", value: "An effect reliably smaller than [SESOI]", why: null },
      ],
    });
    expect(parseFill(reply)).toEqual([
      { field: "population", value: "undergraduate students", why: "typical sample" },
      { field: "falsifies", value: "An effect reliably smaller than [SESOI]", why: "" },
    ]);
  });
  it("the prompt lists only the requested open fields and forbids SESOI numbers", () => {
    const p = fillPrompt(emptyProject(), newHypothesis(), ["population", "test"]);
    expect(p.prompt).toContain("- population:");
    expect(p.prompt).toContain("- test:");
    expect(p.prompt).not.toContain("- theory:");
    expect(p.system).toMatch(/Never suggest numbers/);
  });
});

describe("parser: '… perform better on …'", () => {
  it("reads predictor, outcome and population and asks what 'better' means", () => {
    const r = parseHypothesisSentence("Students who sleep more perform better on exams");
    expect(r.status).toBe("ambiguous");
    expect(r.parts.outcome?.text).toBe("exams");
    expect(r.parts.population?.text).toBe("Students");
    expect(r.question?.text).toContain("better");
  });
  it("a bare 'perform better' with no outcome stays unsupported (the AI fallback takes it)", () => {
    expect(parseHypothesisSentence("Students who sleep more perform better").status).toBe("unsupported");
  });
});

describe("quoteMatch (a model's quote shortened with '...')", () => {
  const src = "We expect that volunteers would rate a larger number of snacks as tasty, and a smaller number as bland, when tasting them after a long walk (Hypothesis 1) or after a nap (Hypothesis 2) compared to their re-\nsting state.";
  it("verbatim stays verbatim", () => {
    expect(quoteMatch(src, "volunteers would rate a larger number of snacks")).toBe("verbatim");
  });
  it("pieces found in order, close together → shortened (as models do)", () => {
    expect(quoteMatch(src, "volunteers would rate a larger number of snacks as tasty ... when tasting them after a long walk ... compared to their resting state.")).toBe("shortened");
    expect(quoteMatch(src, "volunteers would rate a larger number of snacks as tasty […] compared to their resting state")).toBe("shortened");
  });
  it("controls: wrong order, an invented piece, or tiny pieces are not found", () => {
    expect(quoteMatch(src, "compared to their resting state ... volunteers would rate a larger number")).toBeNull();
    expect(quoteMatch(src, "volunteers would rate a larger number of snacks ... when tasting them in a dark room")).toBeNull();
    expect(quoteMatch(src, "volunteers ... snacks ... state")).toBeNull();
  });
  it("pieces too far apart are not joined", () => {
    const far = `Alpha piece of the sentence here. ${"filler words ".repeat(100)} Omega piece of the sentence here.`;
    expect(quoteMatch(far, "Alpha piece of the sentence here ... Omega piece of the sentence here")).toBeNull();
  });
});

describe("normalizeAssociation", () => {
  it("keeps vocabulary ids and maps single direction words (measured: 'weaker')", () => {
    expect(normalizeAssociation("decreased")).toBe("decreased");
    expect(normalizeAssociation("Weaker")).toBe("decreased");
    expect(normalizeAssociation("stronger")).toBe("increased");
    expect(normalizeAssociation("no difference")).toBe("same_as");
  });
  it("never guesses from a phrase (control)", () => {
    expect(normalizeAssociation("cause the effect to reappear")).toBe("");
    expect(normalizeAssociation("not cause the effect to reappear")).toBe("");
    expect(normalizeAssociation("")).toBe("");
  });
});
