import { describe, expect, it } from "vitest";
import { nextDecisions, passWording, PRESENCE_CRITERIA } from "../src/quality/next-decisions.js";
import { CRITERIA } from "../src/quality/criteria.js";
import { emptyProject, newHypothesis, newVariable, type Project } from "../src/hypothesis/schema.js";

/** The sleep/exam sentence after "Yes, use these parts": predictor, outcome, direction — nothing else. */
function sleepProject(): Project {
  const p = emptyProject();
  const sleep = newVariable({ name: "sleep longer", role: "predictor" });
  const exam = newVariable({ name: "examination scores", role: "outcome" });
  p.variables = [sleep, exam];
  p.hypotheses = [newHypothesis({ first: `v:${sleep.id}`, association: "increased", second: `v:${exam.id}` })];
  return p;
}

const ids = (p: Project, i = 0) => nextDecisions(p, p.hypotheses[i].id);

describe("nextDecisions — deterministic ranking", () => {
  it("a blank hypothesis asks to complete the claim first, and nothing about decision rules ahead of it", () => {
    const p = emptyProject();
    p.hypotheses = [newHypothesis()];
    const d = ids(p);
    expect(d.next[0].id).toBe("complete");
    expect(d.next.length).toBeLessThanOrEqual(3);
  });

  it("sleep example: who → measures → what counts against (the consult's three)", () => {
    const d = ids(sleepProject());
    expect(d.next.map((x) => x.id)).toEqual(["population", "measures", "against"]);
    expect(d.next[1].title).toMatch(/sleep longer/);
    expect(d.next[1].title).toMatch(/examination scores/);
  });

  it("measurement is ONE decision even with two unmeasured variables (combined consequences)", () => {
    const d = ids(sleepProject());
    expect([...d.next, ...d.later].filter((x) => x.id === "measures")).toHaveLength(1);
  });

  it("after population and measures, decision rules come next in tier order", () => {
    const p = sleepProject();
    p.context.population = "First-year students";
    p.variables[0].operationalization = "Actigraphy, mean nightly sleep in the exam week";
    p.variables[1].operationalization = "Final exam percentage";
    const d = ids(p);
    expect(d.next.map((x) => x.id)).toEqual(["against", "bounds", "inference"]);
    expect(d.next.every((x) => x.tier === 3)).toBe(true);
  });

  it("a categorical first variable without a reference asks 'compared to what?' before measurement", () => {
    const p = sleepProject();
    p.variables[0].type = "categorical_level";
    const d = ids(p);
    expect(d.next.map((x) => x.id)).toEqual(["population", "comparison", "measures"]);
  });

  it("equivalence without bounds yields one bounds decision, not two (direction + sesoi merged)", () => {
    const p = sleepProject();
    p.hypotheses[0].association = "same_as";
    const all = [...ids(p).next, ...ids(p).later];
    expect(all.filter((x) => x.id === "bounds")).toHaveLength(1);
    expect(all.find((x) => x.id === "bounds")!.criteria).toEqual(expect.arrayContaining(["direction", "sesoi"]));
  });

  it("non-directional prediction asks for a direction in tier 1", () => {
    const p = sleepProject();
    p.hypotheses[0].association = "different";
    expect(ids(p).next[0].id).toBe("direction");
  });

  it("never more than three next; next + later cover every open decision exactly once", () => {
    const d = ids(sleepProject());
    expect(d.next).toHaveLength(3);
    const all = [...d.next, ...d.later].map((x) => x.id);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toEqual(expect.arrayContaining(["population", "measures", "against", "bounds", "inference", "supporting", "why"]));
  });

  it("is stable: same project → same order", () => {
    const p = sleepProject();
    expect(ids(p)).toEqual(ids(p));
  });

  it("'Already specified' lists passing checks with plain labels, and has no score", () => {
    const d = ids(sleepProject());
    expect(d.specified.map((s) => s.criterion)).toEqual(expect.arrayContaining(["single_claim", "direction"]));
    expect(d).not.toHaveProperty("score");
    expect(d).not.toHaveProperty("passed");
  });

  it("returns empty lists for an unknown hypothesis id", () => {
    const d = nextDecisions(sleepProject(), "nope");
    expect(d.next).toEqual([]);
    expect(d.later).toEqual([]);
  });

  it("a fully specified hypothesis has no open decisions", () => {
    const p = sleepProject();
    const h = p.hypotheses[0];
    p.context.population = "First-year students";
    p.context.researchQuestion = "Does sleep relate to exam scores?";
    p.variables[0].operationalization = "Actigraphy";
    p.variables[1].operationalization = "Exam percentage";
    Object.assign(h, {
      kind: "focal",
      functionalForm: "linear",
      mechanism: "Sleep consolidates memory",
      theory: "Memory consolidation",
      derivation: "Consolidation theory says …; therefore …",
      theoryAtStake: "Sleep-dependent consolidation",
      auxiliaryAssumptions: ["Actigraphy measures sleep validly"],
    });
    h.effectSize = { metric: "r", sesoi: "0.10", optimistic: "", pessimistic: "", justification: "Smallest change in grade bands" };
    h.inference = { test: "Pearson correlation", alpha: ".05", sided: "one", correction: "", bayes: "" };
    h.falsification = { supports: "r ≥ .10", falsifies: "90% CI within ±.10 (equivalence test)", inconclusive: "otherwise" };
    const d = ids(p);
    expect(d.next).toEqual([]);
    expect(d.later).toEqual([]);
  });
});

describe("passWording", () => {
  it("presence checks pass as 'Specified', with content not evaluated", () => {
    expect(passWording("mechanism")).toEqual({ label: "Specified", note: "Content not evaluated" });
    expect(PRESENCE_CRITERIA.has("population")).toBe(true);
  });
  it("structural checks pass as 'Specified' without the note", () => {
    expect(passWording("direction")).toEqual({ label: "Specified" });
  });
  it("covers only real criterion ids", () => {
    const real = new Set(CRITERIA.map((c) => c.id));
    for (const id of PRESENCE_CRITERIA) expect(real.has(id), id).toBe(true);
  });
});
