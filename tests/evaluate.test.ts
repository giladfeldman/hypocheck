import { describe, expect, it } from "vitest";
import { LIBRARY_VERSION, canonicalJson } from "../src/index.js";
import {
  RULES,
  RULE_BY_ID,
  RULE_SET_VERSION,
  applyCaps,
  evaluatePublished,
  makeAnchor,
  type Assessment,
  type EvaluationReport,
  type EvidenceGraph,
  type RuleId,
} from "../src/experimental/index.js";
import { addHypothesis, anchorOnce, buildDoc, emptyGraph, texts, type SynthDoc } from "./helpers/synthetic.js";

function run(docs: SynthDoc[], graph: EvidenceGraph, rules: RuleId[]): EvaluationReport {
  return evaluatePublished(graph, { texts: texts(docs), rules });
}
const of = (r: EvaluationReport, rule: RuleId): Assessment[] => r.assessments.filter((a) => a.ruleId === rule);
const verdicts = (r: EvaluationReport, rule: RuleId) => of(r, rule).map((a) => a.verdict);

function paper(intro: string, results: string, discussion = "We discuss the findings.", methods = "Participants completed the task."): SynthDoc {
  return buildDoc("paper", [
    ["Introduction", intro],
    ["Method", methods],
    ["Results", results],
    ["Discussion", discussion],
  ]);
}

describe("R1 ledger_consistency", () => {
  it("NOTE when a stated label never appears in the results (deterministic premise)", () => {
    const d = paper("We test H1, H2 and H3.", "H1 was supported. H2 was supported.");
    const r = run([d], emptyGraph([d]), ["R1"]);
    expect(verdicts(r, "R1")).toEqual(["NOTE"]);
    const a = of(r, "R1")[0];
    expect(a.premises[0].anchor.exact).toBe("H3");
    expect(a.llmDependent).toBe(false);
  });

  it("WARN for an explicit count contradiction (deterministic premises allow WARN)", () => {
    const d = paper("We tested three hypotheses: H1 and H2.", "H1 was supported. H2 was supported.");
    const r = run([d], emptyGraph([d]), ["R1"]);
    expect(verdicts(r, "R1")).toEqual(["WARN"]);
    expect(of(r, "R1")[0].premises.map((p) => p.anchor.exact)).toEqual(["three hypotheses", "H1", "H2"]);
  });

  it.each([
    ["number gaps alone are not errors", "We test H1 and H3.", "H1 held. H3 held."],
    ["a range in the results covers its members", "We test H1, H2 and H3.", "H1–H3 were supported."],
    ["a parent label in the results covers its sub-hypotheses", "We test H1a and H1b.", "H1 was supported."],
    ["a count matching the main numbers is fine", "We tested two hypotheses: H1a, H1b and H2.", "H1a, H1b and H2 held."],
    ["a literature count is not the authors' count", "Earlier work tested five hypotheses. We test H1.", "H1 held."],
  ])("hard negative: %s → OK", (_n, intro, results) => {
    const d = paper(intro, results);
    expect(verdicts(run([d], emptyGraph([d]), ["R1"]), "R1")).toEqual(["OK"]);
  });

  it("NOT_ASSESSABLE without a results section or without labels", () => {
    const noResults = buildDoc("paper", [["Introduction", "We test H1."], ["Discussion", "H1 held."]]);
    expect(verdicts(run([noResults], emptyGraph([noResults]), ["R1"]), "R1")).toEqual(["NOT_ASSESSABLE"]);
    const noLabels = paper("We predict that X raises Y.", "X raised Y.");
    expect(verdicts(run([noLabels], emptyGraph([noLabels]), ["R1"]), "R1")).toEqual(["NOT_ASSESSABLE"]);
  });

  it("duplicate labels in the ledger → NOTE, capped because the ledger is model-proposed", () => {
    const d = paper("H1: X will raise Y. H1: Z will lower W.", "H1 was supported.");
    const g = emptyGraph([d]);
    addHypothesis(g, d, "X will raise Y.", {}, "llm", "H1");
    addHypothesis(g, d, "Z will lower W.", {}, "llm", "H1");
    const dup = of(run([d], g, ["R1"]), "R1").filter((a) => a.explanation.includes("attached to"));
    expect(dup.map((a) => a.verdict)).toEqual(["NOTE"]);
    expect(dup[0].llmDependent).toBe(true);
  });
});

describe("R2 nonsignificance_as_support and R3 absence_claim_basis", () => {
  it("NOTE for both on one sentence, grouped into one concern", () => {
    const d = paper("We test H1.", "The effect was not significant (p = .21), indicating that there is no effect of priming on choice.");
    const r = run([d], emptyGraph([d]), ["R2", "R3"]);
    expect(verdicts(r, "R2")).toEqual(["NOTE"]);
    expect(verdicts(r, "R3")).toEqual(["NOTE"]);
    expect(of(r, "R2")[0].groupId).toBeDefined();
    expect(of(r, "R2")[0].groupId).toBe(of(r, "R3")[0].groupId);
  });

  it("R2 also catches a rejection drawn from non-significance", () => {
    const d = paper("We test H2.", "The interaction was not significant, p = .34, so H2 was rejected.");
    expect(verdicts(run([d], emptyGraph([d]), ["R2"]), "R2")).toEqual(["NOTE"]);
  });

  it("hard negative: 'we did not detect evidence' is OK", () => {
    const d = paper("We test H1.", "We did not detect evidence for an effect of priming (p = .21).");
    const r = run([d], emptyGraph([d]), ["R2", "R3"]);
    expect(verdicts(r, "R2")).toEqual(["OK"]);
    expect(of(r, "R3")[0].applicability).toBe("not_applicable");
    expect(verdicts(r, "R3")).toEqual([null]);
  });

  it("hard negative: an equivalence test in the same sentence or elsewhere is a basis", () => {
    const same = paper("We test H1.", "The effect was not significant (p = .30) and the equivalence test against bounds of ±0.2 was significant, so there was no meaningful effect.");
    const r1 = run([same], emptyGraph([same]), ["R2", "R3"]);
    expect(verdicts(r1, "R2")).toEqual(["OK"]);
    expect(verdicts(r1, "R3")).toEqual(["OK"]);
    const elsewhere = paper("We test H1.", "There was no effect of priming on choice.", "We discuss the findings.", "We set the smallest effect size of interest at d = 0.2 and used TOST.");
    expect(verdicts(run([elsewhere], emptyGraph([elsewhere]), ["R3"]), "R3")).toEqual(["OK"]);
  });

  it("R3 is NOT_ASSESSABLE when referenced material was unavailable or a document text is missing", () => {
    const d = paper("We test H1.", "There was no effect of priming on choice.");
    const g = emptyGraph([d], { paper: ["Supplementary Table S2"] });
    expect(verdicts(run([d], g, ["R3"]), "R3")).toEqual(["NOT_ASSESSABLE"]);
    const pre = buildDoc("pre", [["Hypotheses", "We predict H1."]], "preregistration");
    const g2 = emptyGraph([d, pre]);
    expect(verdicts(evaluatePublished(g2, { texts: { paper: d.text }, rules: ["R3"] }), "R3")).toEqual(["NOT_ASSESSABLE"]);
  });

  it("R2 is not applicable when no non-significant result is reported", () => {
    const d = paper("We test H1.", "The effect was significant, p = .01.");
    const a = of(run([d], emptyGraph([d]), ["R2"]), "R2")[0];
    expect(a.applicability).toBe("not_applicable");
    expect(a.verdict).toBeNull();
  });
});

describe("R4 direction_test_alignment", () => {
  const d = buildDoc("paper", [
    ["Introduction", "H1: Practice will increase accuracy. H2: Noise will affect recall."],
    ["Method", "The test of H1 was one-tailed, testing for a decrease. Tests were two-sided for H2. We used a two-sided test for H1 as well."],
    ["Results", "Accuracy decreased with practice, t(50) = 2.5, p = .01, supporting H1."],
  ]);

  it("directional prediction + two-sided test is OK", () => {
    const g = emptyGraph([d]);
    addHypothesis(g, d, "Practice will increase accuracy.", { direction: ["positive", "Practice will increase accuracy."], sidedness: ["two", "We used a two-sided test for H1 as well."] });
    expect(verdicts(run([d], g, ["R4"]), "R4")).toEqual(["OK"]);
  });

  it("unstated sidedness is NOT_ASSESSABLE, not WARN", () => {
    const g = emptyGraph([d]);
    addHypothesis(g, d, "Practice will increase accuracy.", { direction: ["positive", "Practice will increase accuracy."] });
    expect(verdicts(run([d], g, ["R4"]), "R4")).toEqual(["NOT_ASSESSABLE"]);
  });

  it("one-sided test in the opposite direction: WARN with human-entered premises, NOTE when model-proposed", () => {
    for (const [kind, want] of [["human", "WARN"], ["llm", "NOTE"]] as const) {
      const g = emptyGraph([d]);
      addHypothesis(
        g,
        d,
        "Practice will increase accuracy.",
        {
          direction: ["positive", "Practice will increase accuracy."],
          sidedness: ["one", "one-tailed"],
          tailDirection: ["negative", "testing for a decrease"],
        },
        kind,
      );
      const a = of(run([d], g, ["R4"]), "R4")[0];
      expect(a.rawVerdict).toBe("WARN");
      expect(a.verdict).toBe(want);
      if (kind === "llm") expect(a.capsApplied).toContain("LLM-dependent premise");
    }
  });

  it("an opposite-direction result linked as support: WARN when human-confirmed", () => {
    const g = emptyGraph([d]);
    const h = addHypothesis(g, d, "Practice will increase accuracy.", { direction: ["positive", "Practice will increase accuracy."] }, "human");
    const res = anchorOnce(d, "Accuracy decreased with practice");
    const claim = anchorOnce(d, "supporting H1");
    g.anchors.push(res, claim);
    g.analysisRefs.push({ id: "stats:row:1", anchorIds: [res.id], observedDirection: { state: "observed", value: "negative", evidenceIds: [res.id] }, validation: "unvalidated" });
    g.links.push({ id: "l1", from: "stats:row:1", to: h.id, relation: "supports", outcomeBasis: "authorReported", evidenceIds: [claim.id], origin: { kind: "human" }, reviewStatus: "human-confirmed" });
    const a = of(run([d], g, ["R4"]), "R4");
    expect(a.map((x) => x.verdict)).toEqual(["WARN"]);
    expect(a[0].premises.map((p) => p.role)).toEqual(["prediction", "result direction", "support claim"]);
  });

  it("non-directional predictions are not applicable", () => {
    const g = emptyGraph([d]);
    addHypothesis(g, d, "Noise will affect recall.", { direction: ["nondirectional", "Noise will affect recall."] });
    const a = of(run([d], g, ["R4"]), "R4")[0];
    expect(a.applicability).toBe("not_applicable");
    expect(a.verdict).toBeNull();
  });
});

describe("R5 trend_language", () => {
  it("NOTE when trend wording is used as support", () => {
    const d = paper("We test H2.", "The effect was marginally significant (p = .07), supporting H2.");
    expect(verdicts(run([d], emptyGraph([d]), ["R5"]), "R5")).toEqual(["NOTE"]);
  });
  it("hard negative: trend wording explicitly not taken as support → OK", () => {
    const d = paper("We test H2.", "There was a trend toward significance (p = .08), which we do not interpret as support for H2.");
    expect(verdicts(run([d], emptyGraph([d]), ["R5"]), "R5")).toEqual(["OK"]);
  });
  it("hard negative: a significant linear trend is not trend language → not applicable", () => {
    const d = paper("We test H1.", "A significant linear trend supported H1, p < .001.");
    expect(of(run([d], emptyGraph([d]), ["R5"]), "R5")[0].applicability).toBe("not_applicable");
  });
});

describe("R6 explicit_mismatch", () => {
  const intro = "H1: Gender will moderate the priming effect.";
  it("NOTE for subgroup significance without a test of the difference", () => {
    const d = paper(intro, "The priming effect was significant for women but not for men.");
    const g = emptyGraph([d]);
    addHypothesis(g, d, "Gender will moderate the priming effect.", {});
    expect(verdicts(run([d], g, ["R6"]), "R6")).toEqual(["NOTE"]);
  });
  it("hard negative: the interaction is tested in the same paragraph → OK", () => {
    const d = paper(intro, "The priming effect was significant for women but not for men. The interaction was significant, F(1, 200) = 6.1, p = .01.");
    const g = emptyGraph([d]);
    addHypothesis(g, d, "Gender will moderate the priming effect.", {});
    expect(verdicts(run([d], g, ["R6"]), "R6")).toEqual(["OK"]);
  });
  it("not applicable without a moderation hypothesis; NOT_ASSESSABLE without a ledger", () => {
    const d = paper("H1: Priming will increase choice.", "The priming effect was significant for women but not for men.");
    const g = emptyGraph([d]);
    expect(verdicts(run([d], g, ["R6"]), "R6")).toEqual(["NOT_ASSESSABLE"]);
    addHypothesis(g, d, "Priming will increase choice.", {});
    expect(of(run([d], g, ["R6"]), "R6")[0].applicability).toBe("not_applicable");
  });
});

describe("R7 prereg_delta", () => {
  const pre = buildDoc("pre", [["Hypotheses", "H1: Practice will increase accuracy."]], "preregistration");
  const pap = buildDoc("paper", [["Introduction", "H1: Practice will decrease accuracy."], ["Results", "H1 held."]]);

  function linked(review: "human-confirmed" | "unreviewed", paperDir = "negative") {
    const g = emptyGraph([pap, pre]);
    const hp = addHypothesis(g, pre, "Practice will increase accuracy.", { direction: ["positive", "Practice will increase accuracy."] }, "human");
    const hq = addHypothesis(g, pap, paperDir === "negative" ? "Practice will decrease accuracy." : "Practice will decrease accuracy.", { direction: [paperDir, "Practice will decrease accuracy."] }, "human");
    g.links.push({ id: "c1", from: hq.id, to: hp.id, relation: "correspondsTo", evidenceIds: [], origin: { kind: "human" }, reviewStatus: review });
    return g;
  }

  it("NOTE for a direction change, even when human-confirmed (rule cap until validated)", () => {
    const a = of(run([pap, pre], linked("human-confirmed"), ["R7"]), "R7")[0];
    expect(a.verdict).toBe("NOTE");
    expect(a.explanation).toContain('direction: "positive" → "negative"');
  });
  it("same fields → OK", () => {
    expect(verdicts(run([pap, pre], linked("unreviewed", "positive"), ["R7"]), "R7")).toEqual(["OK"]);
  });
  it("no correspondence links → NOT_ASSESSABLE; no preregistration → not applicable", () => {
    expect(verdicts(run([pap, pre], emptyGraph([pap, pre]), ["R7"]), "R7")).toEqual(["NOT_ASSESSABLE"]);
    expect(of(run([pap], emptyGraph([pap]), ["R7"]), "R7")[0].applicability).toBe("not_applicable");
  });
});

describe("caps and guarantees", () => {
  const rule = (id: RuleId) => RULE_BY_ID[id];
  it("FLAG is never emitted in 0.x; LLM premises cap at NOTE; cross-document needs human-confirmed links", () => {
    expect(applyCaps("FLAG", { rule: rule("R1"), llmDependent: false, links: [] })).toEqual({ verdict: "WARN", capsApplied: ["no FLAG in 0.x"] });
    expect(applyCaps("WARN", { rule: rule("R4"), llmDependent: true, links: [] }).verdict).toBe("NOTE");
    expect(applyCaps("WARN", { rule: rule("R2"), llmDependent: false, links: [] }).verdict).toBe("NOTE");
    const crossWarn = { ...rule("R7"), cap: "WARN" as const };
    expect(applyCaps("WARN", { rule: crossWarn, llmDependent: false, links: [] }).verdict).toBe("NOTE");
    const confirmed = { id: "l", from: "a", to: "b", relation: "correspondsTo" as const, evidenceIds: [], origin: { kind: "human" as const }, reviewStatus: "human-confirmed" as const };
    expect(applyCaps("WARN", { rule: crossWarn, llmDependent: false, links: [confirmed] }).verdict).toBe("WARN");
  });
  it("OK, NOT_ASSESSABLE and null pass through unchanged", () => {
    for (const v of ["OK", "NOT_ASSESSABLE", null] as const) expect(applyCaps(v, { rule: rule("R1"), llmDependent: true, links: [] })).toEqual({ verdict: v, capsApplied: [] });
  });
  it("a premise whose anchor does not re-slice demotes the verdict to NOT_ASSESSABLE", () => {
    const d = buildDoc("paper", [["Introduction", "H1: Practice will increase accuracy."], ["Method", "The test was one-tailed, testing for a decrease."]]);
    const g = emptyGraph([d]);
    addHypothesis(g, d, "Practice will increase accuracy.", { direction: ["positive", "Practice will increase accuracy."], sidedness: ["one", "one-tailed"], tailDirection: ["negative", "testing for a decrease"] }, "human");
    g.anchors = g.anchors.map((a) => (a.exact === "one-tailed" ? { ...a, start: a.start + 2, end: a.end + 2 } : a));
    const a = of(evaluatePublished(g, { texts: texts([d]), rules: ["R4"] }), "R4")[0];
    expect(a.rawVerdict).toBe("WARN");
    expect(a.verdict).toBe("NOT_ASSESSABLE");
    expect(a.capsApplied).toEqual(["premise not anchored"]);
  });
  it("a text that does not match its hash is not read", () => {
    const d = paper("We test H1.", "The effect was not significant (p = .21), indicating that there is no effect of priming on choice.");
    const r = evaluatePublished(emptyGraph([d]), { texts: { paper: d.text + "tampered" }, rules: ["R2"] });
    expect(r.inputHashes.documents[0]).toMatchObject({ textSupplied: true, textMatches: false });
    expect(verdicts(r, "R2")).toEqual(["NOT_ASSESSABLE"]);
  });
  it("every adverse verdict carries anchored premises; no FLAG; reports are deterministic and versioned", () => {
    const d = paper(
      "We tested three hypotheses: H1 and H2. H3: Gender will moderate the priming effect.",
      "The effect was not significant (p = .21), indicating that there is no effect of priming on choice. The effect was marginally significant (p = .07), supporting H2. The priming effect was significant for women but not for men.",
    );
    const g = emptyGraph([d]);
    addHypothesis(g, d, "Gender will moderate the priming effect.", { direction: ["nondirectional", "Gender will moderate the priming effect."] });
    const r1 = evaluatePublished(g, { texts: texts([d]) });
    const r2 = evaluatePublished(g, { texts: texts([d]) });
    expect(canonicalJson(r1)).toBe(canonicalJson(r2));
    expect(r1.rulesRun).toEqual(RULES.map((r) => r.id));
    expect(r1).toMatchObject({ format: "hypocheck.report", formatVersion: "0.1.0", libraryVersion: LIBRARY_VERSION, ruleSetVersion: RULE_SET_VERSION, graphFormatVersion: "0.1.0" });
    expect(r1.inputHashes.graphSha256).toMatch(/^[0-9a-f]{64}$/);
    const adverse = r1.assessments.filter((a) => a.verdict === "NOTE" || a.verdict === "WARN");
    expect(adverse.length).toBeGreaterThanOrEqual(5);
    for (const a of adverse) {
      expect(a.premises.length).toBeGreaterThan(0);
      for (const p of a.premises) expect(d.text.slice(p.anchor.start, p.anchor.end)).toBe(p.anchor.exact);
    }
    expect(r1.assessments.some((a) => a.verdict === "FLAG")).toBe(false);
    for (const a of r1.assessments) expect(a.applicability === "not_applicable").toBe(a.verdict === null);
    expect(Object.values(r1.summary.byVerdict).reduce((x, y) => x + y, 0)).toBe(r1.assessments.length);
  });
  it("rejects an unknown rule id", () => {
    const d = paper("a", "b");
    expect(() => evaluatePublished(emptyGraph([d]), { texts: texts([d]), rules: ["R9" as RuleId] })).toThrow(/unknown rule/);
  });
  it("makeAnchor is exported for hosts building premises", () => {
    expect(makeAnchor("abc def", "x", 4, 7).exact).toBe("def");
  });
});
