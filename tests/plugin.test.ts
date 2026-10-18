import { describe, expect, it } from "vitest";
import { evaluatePublished, toPluginIssues } from "../src/experimental/index.js";
import { addHypothesis, buildDoc, emptyGraph, texts } from "./helpers/synthetic.js";

const d = buildDoc("paper", [
  ["Introduction", "We tested three hypotheses: H1 and H2."],
  ["Results", "H1 held. The effect was not significant (p = .21), indicating that there is no effect of priming on choice. The effect was marginally significant (p = .07), supporting H2."],
]);
const report = evaluatePublished(emptyGraph([d]), { texts: texts([d]) });

describe("toPluginIssues", () => {
  const issues = toPluginIssues(report);
  const concerns = issues.filter((i) => !i.id.endsWith(":summary"));

  it("maps WARN to warning and NOTE to info with isFinding false; never error", () => {
    expect(issues.some((i) => i.severity === "error")).toBe(false);
    const warn = concerns.filter((i) => i.metadata?.verdict === "WARN");
    const note = concerns.filter((i) => i.metadata?.verdict === "NOTE");
    expect(warn.length).toBe(1);
    expect(warn.every((i) => i.severity === "warning" && i.isFinding === true)).toBe(true);
    expect(note.length).toBe(2);
    expect(note.every((i) => i.severity === "info" && i.isFinding === false)).toBe(true);
  });

  it("groups R2 and R3 on one claim into a single issue", () => {
    const grouped = concerns.filter((i) => (i.metadata?.ruleIds as string[]).includes("R2"));
    expect(grouped).toHaveLength(1);
    expect(grouped[0].metadata?.ruleIds).toEqual(["R2", "R3"]);
    expect(grouped[0].metadata?.assessmentIds).toHaveLength(2);
  });

  it("locates each issue at its primary premise and keeps other premises as secondary locations", () => {
    const count = concerns.find((i) => i.metadata?.verdict === "WARN")!;
    expect(d.text.slice(count.location!.characterStart, count.location!.characterEnd)).toBe(count.location!.contextText);
    expect(count.location!.contextText).toBe("three hypotheses");
    expect((count.metadata?.secondaryLocations as unknown[]).length).toBe(2);
  });

  it("suggests manual review with instructions, never replacement text", () => {
    for (const i of concerns) {
      expect(i.suggestion?.type).toBe("manual");
      expect(i.suggestion?.instructions?.length).toBeGreaterThan(10);
      expect(i.suggestion).not.toHaveProperty("suggestedText");
    }
  });

  it("puts OK / NOT_ASSESSABLE / not applicable only in one summary item", () => {
    const summary = issues.filter((i) => i.id.endsWith(":summary"));
    expect(summary).toHaveLength(1);
    expect(summary[0]).toMatchObject({ severity: "info", isFinding: false });
    expect(concerns.every((i) => i.metadata?.verdict === "NOTE" || i.metadata?.verdict === "WARN")).toBe(true);
    expect(summary[0].description).toMatch(/does not certify/);
  });

  it("policy: minVerdict WARN drops notes; includeSummary false drops the summary", () => {
    const onlyWarn = toPluginIssues(report, { minVerdict: "WARN", includeSummary: false });
    expect(onlyWarn.map((i) => i.metadata?.verdict)).toEqual(["WARN"]);
  });

  it("an LLM-capped WARN arrives as info, not as a finding", () => {
    const dd = buildDoc("paper", [["Introduction", "H1: Practice will increase accuracy."], ["Method", "The test was one-tailed, testing for a decrease."]]);
    const g = emptyGraph([dd]);
    addHypothesis(g, dd, "Practice will increase accuracy.", { direction: ["positive", "Practice will increase accuracy."], sidedness: ["one", "one-tailed"], tailDirection: ["negative", "testing for a decrease"] }, "llm");
    const i = toPluginIssues(evaluatePublished(g, { texts: texts([dd]), rules: ["R4"] }), { includeSummary: false });
    expect(i.map((x) => [x.severity, x.isFinding, x.metadata?.llmDependent])).toEqual([["info", false, true]]);
  });
});
