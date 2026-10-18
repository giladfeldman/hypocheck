import { describe, expect, it } from "vitest";
import {
  canonicalSection,
  findAbsenceBasis,
  findAbsenceClaims,
  findHypothesisCountClaims,
  findNonsignificance,
  findRejectionClaims,
  findStatedSidedness,
  findSubgroupSignificance,
  findSupportLanguage,
  findTrendLanguage,
  labelInventory,
  rangesFor,
  sentencesIn,
} from "../src/experimental/index.js";

describe("trend language", () => {
  it.each([
    "The effect was marginally significant, p = .07.",
    "The difference approached significance (p = .06).",
    "There was a trend toward significance for H2.",
    "We observed a trend towards higher scores in the experimental group.",
    "The effect was borderline significant.",
    "A trend-level effect emerged.",
    "The effect fell just short of significance.",
  ])("matches: %s", (t) => {
    expect(findTrendLanguage(t).length).toBeGreaterThan(0);
  });
  it.each([
    "A significant linear trend was found, F(1, 98) = 12.1, p < .001.",
    "We ran a trend analysis across the four time points.",
    "Time trends in the data were removed before analysis.",
    "The effect was significant, p = .01.",
  ])("hard negative: %s", (t) => {
    expect(findTrendLanguage(t)).toEqual([]);
  });
});

describe("support language with clause negation", () => {
  it("finds affirmative support wording", () => {
    expect(findSupportLanguage("This result is consistent with H2.").map((m) => m.exact)).toEqual(["consistent with"]);
    expect(findSupportLanguage("As predicted, scores increased.").length).toBe(1);
  });
  it.each([
    "H2 was not supported.",
    "We do not interpret this trend as support for H2.",
    "This pattern is not consistent with the prediction.",
    "The data didn't confirm the hypothesis.",
  ])("negated: %s", (t) => {
    expect(findSupportLanguage(t)).toEqual([]);
  });
  it("a negation in another clause does not hide support in this one", () => {
    expect(findSupportLanguage("H1 was not supported, but the trend supported H2.").length).toBe(1);
  });
});

describe("non-significance, absence claims, rejection and basis", () => {
  it.each(["The difference was not significant.", "The effect was non-significant.", "t(98) = 1.1, p = .27", "F < 1, p > .50", "The effect did not reach significance.", "(n.s.)"])(
    "non-significance: %s",
    (t) => expect(findNonsignificance(t).length).toBeGreaterThan(0),
  );
  it.each(["The effect was significant, p = .01.", "p < .05", "p = .049"])("not non-significance: %s", (t) => expect(findNonsignificance(t)).toEqual([]));

  it.each([
    "There was no effect of priming on choice.",
    "The groups did not differ in accuracy.",
    "The two conditions were equivalent.",
    "This shows the absence of an effect.",
    "We therefore accepted the null hypothesis.",
    "Accuracy was unaffected by time pressure.",
    "The manipulation had no influence on ratings.",
  ])("absence claim: %s", (t) => expect(findAbsenceClaims(t).length).toBeGreaterThan(0));
  it.each([
    "There was no significant difference between the groups.",
    "We did not detect evidence for an effect.",
    "We found no evidence of a difference.",
    "The groups did not differ significantly.",
    "The groups did not significantly differ.",
  ])("hard negative (statement about the test or the evidence, not absence): %s", (t) => expect(findAbsenceClaims(t)).toEqual([]));

  it("rejection claims, but not 'not supported'", () => {
    expect(findRejectionClaims("H2 was therefore rejected.").length).toBe(1);
    expect(findRejectionClaims("We reject our second hypothesis.").length).toBe(1);
    expect(findRejectionClaims("H2 was not supported.")).toEqual([]);
  });

  it.each([
    "An equivalence test with bounds of ±0.2 was significant.",
    "TOST p = .01",
    "The Bayes factor favoured the null, BF01 = 8.",
    "We set the smallest effect size of interest at d = 0.2.",
    "The interval excluded effects larger than d = 0.2.",
  ])("basis: %s", (t) => expect(findAbsenceBasis(t).length).toBeGreaterThan(0));
  it("no basis in a plain non-significant report", () => expect(findAbsenceBasis("The effect was not significant, p = .30.")).toEqual([]));
});

describe("stated sidedness", () => {
  it("finds one- and two-sided statements", () => {
    expect(findStatedSidedness("We used a one-tailed t-test.").map((m) => m.sided)).toEqual(["one"]);
    expect(findStatedSidedness("All tests were two-sided.").map((m) => m.sided)).toEqual(["two"]);
  });
  it("unstated sidedness yields nothing (never assumed)", () => {
    expect(findStatedSidedness("We used a Welch t-test with alpha = .05.")).toEqual([]);
  });
});

describe("label inventory", () => {
  it("normalises labels, expands lists and ranges, ignores H0 and chemistry", () => {
    const t = "H1 and H2a were stated. Hypothesis 3 too. Hypotheses 4 and 5. H6–H8 hold. H0 is the null. H2O is water.";
    expect(labelInventory(t).map((o) => o.label)).toEqual(["H1", "H2a", "H3", "H4", "H5", "H6", "H7", "H8"]);
  });
  it("offsets point at the label text and sections are attached", () => {
    const t = "Intro\n\nWe predict H1.\n\nResults\n\nH1 holds.";
    const inv = labelInventory(t, [
      { id: "a", label: "Introduction", start: 0, end: 23 },
      { id: "b", label: "Results", start: 23, end: t.length },
    ]);
    expect(inv.map((o) => [o.label, o.sectionClass])).toEqual([
      ["H1", "introduction"],
      ["H1", "results"],
    ]);
    for (const o of inv) expect(t.slice(o.start, o.end)).toBe(o.exact);
  });
});

describe("count claims", () => {
  it("reads the authors' own counts", () => {
    expect(findHypothesisCountClaims("We tested three hypotheses in this study.").map((c) => c.count)).toEqual([3]);
    expect(findHypothesisCountClaims("The present study has 4 preregistered hypotheses.").map((c) => c.count)).toEqual([4]);
  });
  it("hard negative: a literature statement is not a count claim", () => {
    expect(findHypothesisCountClaims("Previous work tested two hypotheses about priming.")).toEqual([]);
  });
});

describe("sections and sentences", () => {
  it("canonical section classes", () => {
    expect(["Abstract", "1. Introduction", "The present research", "Method", "Participants", "Results", "Confirmatory analyses", "General Discussion", "References", "Acknowledgements"].map(canonicalSection)).toEqual([
      "abstract",
      "introduction",
      "hypotheses",
      "methods",
      "methods",
      "results",
      "results",
      "discussion",
      "references",
      "other",
    ]);
  });
  it("without classified sections the whole text is one range", () => {
    expect(rangesFor("abc", [], ["results"])).toEqual({ ranges: [{ start: 0, end: 3 }], sectionsKnown: false });
  });
  it("sentence offsets are document offsets", () => {
    const t = "Head\n\nOne sentence here. Two sentence here.";
    for (const s of sentencesIn(t, [{ start: 6, end: t.length }])) expect(t.slice(s.start, s.end)).toBe(s.text);
  });
});

describe("subgroup significance", () => {
  it("finds a significant-but-not contrast", () => {
    expect(findSubgroupSignificance("The effect was significant for women but not for men.").length).toBe(1);
    expect(findSubgroupSignificance("Priming was significant in Study 1, whereas in Study 2 it was not.").length).toBe(1);
  });
  it("hard negative: one group only", () => {
    expect(findSubgroupSignificance("The effect was significant for women.")).toEqual([]);
  });
});
