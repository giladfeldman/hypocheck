import { describe, expect, it } from "vitest";
import { findCandidates, quoteIsVerbatim, specificityLevel, splitSentences } from "../src/quality/freetext.js";

describe("specificityLevel (ported rule-based ordinal)", () => {
  it.each([
    ["The study examines attitudes toward immigration in Austria.", 0],
    ["We hypothesize that time pressure will increase confirmation bias.", 1],
    ["We predict that the social rule will reduce errors, with Cohen's d of at least 0.3.", 2],
    ["We predict that the social rule will reduce errors; we will reject the hypothesis if the 90% CI lies within ±0.2.", 3],
    ["We expect that framing will affect choices.", 0],
  ])("%s → level %i", (text, level) => {
    expect(specificityLevel(text).level).toBe(level);
  });
});

describe("findCandidates", () => {
  const doc = `Introduction. Confirmation bias is common in reasoning tasks.
Many studies have used the Wason task.

H1: Participants will select fewer confirmatory cards for social rules than for descriptive rules.
We also expect that time pressure will increase the bias. Data were collected online.`;

  it("keeps hypothesis sentences with exact offsets and labels", () => {
    const c = findCandidates(doc);
    expect(c.map((x) => x.label ?? null)).toEqual(["H1", null]);
    for (const x of c) expect(doc.slice(x.start, x.end)).toBe(x.text);
    expect(c[1].text).toBe("We also expect that time pressure will increase the bias.");
  });

  it("does not split inside decimals, abbreviations or p-values", () => {
    const t =
      "We predict that the effect will be at least d = 0.3 (cf. Smith et al. 2020), e.g. in Study 2. " +
      "Results showed p = .04. H2: Older adults will show smaller effects than younger adults.";
    const s = splitSentences(t).map((x) => x.text);
    expect(s).toEqual([
      "We predict that the effect will be at least d = 0.3 (cf. Smith et al. 2020), e.g. in Study 2.",
      "Results showed p = .04.",
      "H2: Older adults will show smaller effects than younger adults.",
    ]);
  });

  it("returns nothing for text without hypothesis markers (two-sided control)", () => {
    expect(findCandidates("Data were collected online. Participants were paid £3.")).toEqual([]);
  });
});

describe("quoteIsVerbatim", () => {
  const src = "We predict that participants under time pres-\nsure will show a “stronger” bias.";
  it("accepts a quote that differs only in whitespace, hyphenation and quote marks", () => {
    expect(quoteIsVerbatim(src, 'participants under time pressure will show a "stronger" bias')).toBe(true);
  });
  it("rejects a paraphrase", () => {
    expect(quoteIsVerbatim(src, "participants under time pressure will show more bias")).toBe(false);
  });
  it("rejects very short quotes that could match by accident", () => {
    expect(quoteIsVerbatim(src, "bias")).toBe(false);
  });
});

describe("candidate context", () => {
  it("scores a hypothesis together with the sentences that elaborate it", () => {
    const t =
      "H1: Participants under time pressure will select more confirmatory cards. The smallest effect of interest is d = 0.25. " +
      "We will conclude that H1 is not supported if the 90% CI lies within ±0.25.\n\nH2: Social rules will reduce bias.";
    const c = findCandidates(t);
    expect(c.map((x) => x.label)).toEqual(["H1", "H2"]);
    const h1 = c[0];
    expect(specificityLevel(h1.text).level).toBe(1);
    expect(specificityLevel(h1.context!).level).toBe(3);
    // an unlabelled "We expect …" right after H1 is H1's elaboration, not a new candidate
    const c2 = findCandidates("H1: X will increase Y in adults. We expect at least d = 0.25 and will reject H1 if the CI lies within ±0.25.");
    expect(c2).toHaveLength(1);
    expect(specificityLevel(c2[0].context!).level).toBe(3);
    // context stops at the paragraph break: H2's context is only its own sentence
    expect(c[c.length - 1].context).toBe("H2: Social rules will reduce bias.");
  });
});
