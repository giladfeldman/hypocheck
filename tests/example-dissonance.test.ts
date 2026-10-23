/** The v0.52 worked example: what it contains and how it reads. */
import { describe, expect, it } from "vitest";
import { checkProject, dissonanceExample, hypothesisStatements, labelHypotheses, summarySentence } from "../src/index.js";
import { importLegacyXlsx, projectXlsx } from "../src/export-xlsx.js";

describe("dissonanceExample", () => {
  const p = dissonanceExample();

  it("reads as the v0.52 sheet's own output (effect-name typo corrected)", () => {
    expect(summarySentence(p)).toBe(
      "This study has 2 main hypotheses. Of these, 1 has subordinate hypotheses, for a total of 3 hypotheses. A focal hypothesis has been specified. There is also 1 manipulation check.",
    );
    expect(hypothesisStatements(p)).toEqual([
      'MC1: "Counter-attitudinal argument" will be associated with higher "Perceived discomfort" (this is a manipulation check).',
      'H1a: "Counter-attitudinal argument" will be associated with higher "Pre-post attitude change" in the condition of "Perceived freedom of choice" (this is the focal hypothesis).',
      'H1b: "Age" will be associated with lower "Dissonance -> Attitude change".',
      'H2: "Importance of topic" will be associated with higher "Dissonance -> Attitude change" in the condition of "Perceived freedom of choice".',
    ]);
  });

  it("keeps the sheet's verbal effect sizes and two theories", () => {
    const [, h1a, h1b, h2] = p.hypotheses;
    expect([h1a.effectSize.optimistic, h2.effectSize.optimistic]).toEqual(["medium effect", "small effect"]);
    expect(new Set(p.hypotheses.map((h) => h.theory))).toEqual(new Set(["Cognitive dissonance theory", "Personality maturation assumption"]));
    expect(h1b.listing).toBe("subset");
    expect(labelHypotheses(p.hypotheses).map((l) => l.label)).toEqual(["MC1", "H1a", "H1b", "H2"]);
  });

  it("raises no project-level issue: every variable is used, a focal hypothesis and a research question are set", () => {
    expect(checkProject(p)).toEqual([]);
  });

  it("survives an xlsx round trip", async () => {
    const { project, warnings } = await importLegacyXlsx(await projectXlsx(p));
    expect(warnings).toEqual([]);
    expect(hypothesisStatements(project)).toEqual(hypothesisStatements(p));
  });
});
