import { confBiasXlsx } from "./helpers/confbias.js";
import { describe, expect, it } from "vitest";
import { CRITERIA, checkHypothesis, checkProject, hasEffectBounds, predictionBoundsDone, scoreProject } from "../src/quality/criteria.js";
import { emptyProject, newHypothesis, newVariable, type Hypothesis, type Project } from "../src/hypothesis/schema.js";
import { labelHypotheses } from "../src/hypothesis/generate.js";
import { importLegacyXlsx } from "../src/export-xlsx.js";

/** A project whose single focal hypothesis satisfies every criterion. */
function complete(): Project {
  const p = emptyProject();
  p.context.researchQuestion = "Does a social framing of a conditional rule reduce confirmation bias?";
  p.context.population = "Adult online participants (Prolific, UK)";
  const social = newVariable({ name: "Social rule", role: "manipulated", type: "categorical_level", operationalization: "Rule phrased as a social contract" });
  const desc = newVariable({ name: "Descriptive rule", role: "manipulated", type: "categorical_level", operationalization: "Rule phrased descriptively" });
  const bias = newVariable({ name: "Confirmation bias", role: "outcome", type: "continuous", operationalization: "Proportion of confirmatory card selections" });
  const check = newVariable({ name: "Perceived sociality", role: "outcome", type: "continuous", operationalization: "1–7 rating" });
  p.variables = [social, desc, bias, check];
  const h = newHypothesis({
    theory: "Social contract theory",
    mechanism: "Cheater-detection modules are engaged by social rules",
    effectName: "Social advantage",
    listing: "main",
    first: `v:${social.id}`,
    association: "decreased",
    second: `v:${bias.id}`,
    qualification: "compared_to",
    qualifier: `v:${desc.id}`,
    kind: "focal",
    derivation: "Theory says cheater detection is domain-specific; social rules recruit it; therefore fewer confirmatory selections.",
    theoryAtStake: "Domain-specific cheater detection",
    functionalForm: "difference",
    effectSize: { metric: "Cohen's d", sesoi: "0.2", optimistic: "", pessimistic: "", justification: "Smallest effect judged theoretically meaningful (half the effect the theory implies)" },
    inference: { test: "Welch t-test", alpha: ".05", sided: "one", correction: "", bayes: "" },
    falsification: {
      supports: "The effect is negative and the one-sided test against d = 0 is significant at .05",
      falsifies: "The 90% CI falls entirely within the equivalence bounds of ±0.2 (TOST), or the effect is significantly positive",
      inconclusive: "Neither of the above",
    },
    auxiliaryAssumptions: ["Participants read the rule"],
  });
  const mc = newHypothesis({
    listing: "unlisted",
    kind: "manipulation_check",
    first: `v:${social.id}`,
    association: "increased",
    second: `v:${check.id}`,
    qualification: "compared_to",
    qualifier: `v:${desc.id}`,
    inference: { test: "Welch t-test", alpha: ".05", sided: "one", correction: "", bayes: "" },
  });
  p.hypotheses = [h, mc];
  return p;
}

function statusOf(p: Project, criterion: string, index = 0) {
  const all = labelHypotheses(p.hypotheses);
  return checkHypothesis(p, all[index], all).find((x) => x.criterion === criterion)!.status;
}

function mutate(fn: (h: Hypothesis, p: Project) => void): Project {
  const p = complete();
  fn(p.hypotheses[0], p);
  return p;
}

describe("criteria catalogue", () => {
  it("has 18 numbered criteria, each with at least one source", () => {
    expect(CRITERIA.map((c) => c.number)).toEqual(Array.from({ length: 18 }, (_, i) => i + 1));
    // literature-based criteria must cite something; tool conventions are labelled as such
    for (const c of CRITERIA) if (c.basis === "literature") expect(c.sources.length, c.id).toBeGreaterThan(0);
  });
});

describe("a complete focal hypothesis", () => {
  it("passes or is not-applicable on every criterion", () => {
    const p = complete();
    const all = labelHypotheses(p.hypotheses);
    const res = checkHypothesis(p, all[0], all);
    expect(res).toHaveLength(18);
    expect(res.filter((x) => x.status === "warn" || x.status === "fail")).toEqual([]);
    expect(checkProject(p)).toEqual([]);
  });
});

// Each row: the criterion, a mutation that should break it, and the expected status after.
const NEGATIVE: [string, (h: Hypothesis, p: Project) => void, string][] = [
  ["variables", (h) => (h.second = "v:missing"), "fail"],
  ["variables", (_h, p) => (p.variables[2].role = ""), "warn"],
  ["operationalized", (_h, p) => (p.variables[2].operationalization = ""), "fail"],
  ["single_claim", (h) => (h.association = ""), "fail"],
  ["single_claim", (h) => (h.qualifier = h.first), "fail"],
  ["single_claim", (h) => (h.second = `h:${h.id}`), "fail"],
  ["direction", (h) => (h.association = "different"), "warn"],
  ["direction", (h) => ((h.association = "same_as"), (h.effectSize.sesoi = "")), "fail"],
  ["comparison", (h) => ((h.qualification = ""), (h.qualifier = "")), "warn"],
  ["form", (h, p) => ((h.functionalForm = ""), (p.variables[0].type = "continuous")), "warn"],
  ["sesoi", (h) => (h.effectSize.sesoi = ""), "fail"],
  ["sesoi", (h) => (h.effectSize.metric = ""), "warn"],
  ["inference", (h) => (h.inference.alpha = ""), "warn"],
  ["falsification", (h) => (h.falsification.falsifies = ""), "fail"],
  ["falsification", (h) => (h.falsification.falsifies = "The effect is not significant (p > .05)"), "warn"],
  ["population", (_h, p) => (p.context.population = ""), "warn"],
  ["auxiliary", (h, p) => ((h.auxiliaryAssumptions = []), (p.hypotheses = [h])), "warn"],
  ["manipulation_check", (h, p) => (p.hypotheses = [h]), "warn"],
  ["mechanism", (h) => (h.mechanism = ""), "warn"],
  ["derivation", (h) => (h.derivation = ""), "warn"],
  ["theory_at_stake", (h) => (h.theoryAtStake = ""), "warn"],
  ["severity", (h) => ((h.association = "different"), (h.effectSize.sesoi = ""), (h.falsification.falsifies = "")), "fail"],
  ["severity", (h) => (h.falsification.falsifies = ""), "warn"],
  ["confirmatory", (h) => (h.kind = "exploratory"), "warn"],
  ["scope", (h) => (h.falsification.supports = "The effect may be negative"), "warn"],
  ["scope", (h) => (h.falsification.inconclusive = "Results could possibly be mixed"), "warn"],
];

describe("each criterion fails when its field is removed", () => {
  it.each(NEGATIVE)("%s", (criterion, fn, expected) => {
    expect(statusOf(complete(), criterion)).toBe("pass");
    expect(statusOf(mutate(fn), criterion)).toBe(expected);
  });

  it("every criterion has at least one negative test", () => {
    const covered = new Set(NEGATIVE.map((n) => n[0]));
    for (const c of CRITERIA) expect(covered.has(c.id), c.id).toBe(true);
  });
});

describe("project-level checks", () => {
  it("flags more than one focal hypothesis", () => {
    const p = complete();
    p.hypotheses[1].kind = "focal";
    p.hypotheses[1].listing = "main";
    expect(checkProject(p).some((i) => i.status === "warn" && /More than one focal/.test(i.message))).toBe(true);
  });

  it("flags duplicate and unused variables", () => {
    const p = complete();
    p.variables.push(newVariable({ name: "social rule" }), newVariable({ name: "Unused thing" }));
    const msgs = checkProject(p).map((i) => i.message).join(" | ");
    expect(msgs).toMatch(/Duplicate variable names: social rule/);
    expect(msgs).toMatch(/not used in any hypothesis \(fine for descriptive or exclusion variables\): social rule, Unused thing/);
  });
});

describe("ConfBias example scorecard", () => {
  it("flags the focal hypothesis for missing SESOI and falsifier, as the sheet never asked for them", async () => {
    const { project } = await importLegacyXlsx(await confBiasXlsx());
    const { cards } = scoreProject(project);
    const focal = cards.find((c) => c.label === "H1a")!;
    const st = Object.fromEntries(focal.results.map((x) => [x.criterion, x.status]));
    expect(st.sesoi).toBe("fail");
    expect(st.falsification).toBe("fail");
    expect(st.direction).toBe("pass");
    expect(st.mechanism).toBe("pass");
  });
});

// Regressions from the tier-2 consult (Sonnet, 2026-10-13).
describe("consult 2026-10-13 regressions", () => {
  it("F1: a correct equivalence-test falsifier is not flagged as 'not significant'", () => {
    expect(statusOf(mutate((h) => (h.falsification.falsifies = "Equivalence test (TOST) not significant, p > .05, against ±0.2 bounds")), "falsification")).toBe("pass");
  });
  it("F2: 'p > .05 and the CI includes zero' is still the non-significance fallacy", () => {
    expect(statusOf(mutate((h) => (h.falsification.falsifies = "p > .05 and the 95% confidence interval includes zero")), "falsification")).toBe("warn");
  });
  it("F3: an interaction with a stated falsifier is not a severity fail", () => {
    const p = mutate((h) => ((h.association = "interaction"), (h.effectSize.sesoi = ""), (h.functionalForm = "interaction")));
    expect(statusOf(p, "severity")).toBe("warn");
  });
  it("F3: a directional moderation ('strengthens') counts as directional", () => {
    expect(statusOf(mutate((h) => (h.association = "strengthens")), "direction")).toBe("pass");
  });
  it("F4: a categorical level with an equivalence prediction still needs a comparison", () => {
    expect(statusOf(mutate((h) => ((h.association = "same_as"), (h.qualification = ""), (h.qualifier = ""))), "comparison")).toBe("warn");
  });
  it("F4: a binary predictor implies a group difference (form n/a)", () => {
    expect(statusOf(mutate((h, p) => ((h.functionalForm = ""), (p.variables[0].type = "binary"))), "form")).toBe("na");
  });
  it("F6: an auxiliary row testing the manipulated variable clears the manipulation-check warning", () => {
    const p = mutate((_h, p) => (p.hypotheses[1].kind = "auxiliary"));
    expect(statusOf(p, "manipulation_check")).toBe("pass");
  });
  it("F6: a validation note in the auxiliary assumptions clears it too", () => {
    const p = mutate((h, p) => ((p.hypotheses = [h]), (h.auxiliaryAssumptions = ["Social rule vs Descriptive rule manipulation validated in a pilot study"])));
    expect(statusOf(p, "manipulation_check")).toBe("pass");
  });
  it("F6/F7/F13: the manipulation-check row itself is not judged on severity, theory or manipulation checks", () => {
    const p = complete();
    p.hypotheses[1].theory = "Some theory";
    expect(statusOf(p, "severity", 1)).toBe("na");
    expect(statusOf(p, "theory_at_stake", 1)).toBe("na");
  });
  it("F8: the pass message does not overclaim severity", () => {
    const p = complete();
    const all = labelHypotheses(p.hypotheses);
    const sev = checkHypothesis(p, all[0], all).find((x) => x.criterion === "severity")!;
    expect(sev.message).not.toMatch(/risky test/);
  });
  it("F9: two focal hypotheses are a warning (co-primary outcomes exist), not a failure", () => {
    const p = complete();
    p.hypotheses[1].kind = "focal";
    p.hypotheses[1].listing = "main";
    expect(checkProject(p).find((i) => /focal/.test(i.message))?.status).toBe("warn");
  });
  it("F9: a single listed hypothesis needs no focal mark", () => {
    const p = complete();
    p.hypotheses[0].kind = "";
    expect(checkProject(p).filter((i) => /focal/.test(i.message))).toEqual([]);
  });
  it("F10: a listed exploratory hypothesis does not need an inference criterion", () => {
    expect(statusOf(mutate((h) => ((h.kind = "exploratory"), (h.inference.test = ""))), "inference")).toBe("na");
  });
  it("F11: tentative wording in the mechanism is fine", () => {
    expect(statusOf(mutate((h) => (h.mechanism = "Social rules may engage cheater detection")), "scope")).toBe("pass");
  });
  it("F12: an auxiliary row about unrelated variables does not satisfy this hypothesis", () => {
    const p = mutate((h, p) => {
      h.auxiliaryAssumptions = [];
      const a = newVariable({ name: "A", role: "outcome", operationalization: "x" });
      const b = newVariable({ name: "B", role: "outcome", operationalization: "x" });
      p.variables.push(a, b);
      p.hypotheses[1] = newHypothesis({ listing: "unlisted", kind: "auxiliary", first: `v:${a.id}`, association: "increased", second: `v:${b.id}` });
    });
    expect(statusOf(p, "auxiliary")).toBe("warn");
  });
  it("F19: equivalence with optimistic/pessimistic bounds (no SESOI) passes direction", () => {
    const p = mutate((h) => ((h.association = "same_as"), (h.effectSize.sesoi = ""), (h.effectSize.optimistic = "0.1"), (h.effectSize.pessimistic = "0.3")));
    expect(statusOf(p, "direction")).toBe("pass");
  });
});

// Regressions from the UX/value consult (2026-10-18).
describe("consult 2026-10-18 regressions", () => {
  it("d-a317a6: a blank hypothesis gets no positive pass for variables, confirmatory status or wording", () => {
    const p = emptyProject();
    p.hypotheses = [newHypothesis()];
    const { cards } = scoreProject(p);
    const st = Object.fromEntries(cards[0].results.map((x) => [x.criterion, x.status]));
    expect(st.variables).toBe("pending");
    expect(st.confirmatory).toBe("pending");
    expect(st.scope).toBe("pending");
    expect(cards[0].results.filter((x) => x.status === "pass")).toEqual([]);
    expect(cards[0].passed).toBe(0);
    // "not yet assessable" counts as not passed (it stays in the applicable count), but it is not a failure
    expect(cards[0].failures).toBe(cards[0].results.filter((x) => x.status === "fail").length);
    expect(cards[0].applicable).toBe(cards[0].results.filter((x) => x.status !== "na").length);
    expect(cards[0].results.filter((x) => x.status === "pending").every((x) => /^Not yet assessable/.test(x.message))).toBe(true);
  });

  it("d-a317a6: a half-written prediction does not claim all its variables are named", () => {
    const p = complete();
    p.hypotheses[0].second = "";
    expect(statusOf(p, "variables")).toBe("pending");
  });

  it("d-a317a6: a chance-level prediction needs no second variable", () => {
    const p = mutate((h) => ((h.association = "above_chance"), (h.second = ""), (h.qualification = ""), (h.qualifier = "")));
    expect(statusOf(p, "variables")).toBe("pass");
  });

  it("d-b269eb: bounds are complete with a SESOI or BOTH optimistic and pessimistic bounds", () => {
    const h = complete().hypotheses[0];
    expect(hasEffectBounds(h)).toBe(true);
    expect(predictionBoundsDone(h)).toBe(true);
    h.effectSize.sesoi = "";
    h.effectSize.optimistic = "0.5";
    expect(hasEffectBounds(h)).toBe(false);
    expect(predictionBoundsDone(h)).toBe(false);
    h.effectSize.pessimistic = "0.1";
    expect(hasEffectBounds(h)).toBe(true);
    expect(predictionBoundsDone(h)).toBe(true);
    h.falsification.falsifies = " ";
    expect(predictionBoundsDone(h)).toBe(false);
  });

  it("d-5b4e0d: every criterion cites at least one source with a DOI", () => {
    for (const c of CRITERIA) expect(c.sources.some((s) => !!s.doi), c.id).toBe(true);
  });
});
