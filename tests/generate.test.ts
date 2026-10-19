import { describe, expect, it } from "vitest";
import {
  designTable,
  discussionTemplate,
  hypothesisStatements,
  labelHypotheses,
  resultsTemplate,
  summarySentence,
  variableDefinition,
  variableLists,
} from "../src/hypothesis/generate.js";
import { newHypothesis, newVariable, emptyProject } from "../src/hypothesis/schema.js";

import { confBias, CONFBIAS_SOURCE } from "./helpers/confbias.js";

// Source of the golden fixture: see tests/helpers/confbias.ts.
void CONFBIAS_SOURCE;

describe("golden: Bjørn's v0.5 ConfBias example, with the v0.5 defects corrected", () => {
  it("imports every variable and hypothesis row without warnings", async () => {
    const { project, warnings } = await confBias();
    expect(warnings).toEqual([]);
    expect(project.variables).toHaveLength(15);
    expect(project.hypotheses).toHaveLength(13);
  });

  it("generates the hypothesis statements", async () => {
    const { project } = await confBias();
    expect(hypothesisStatements(project)).toEqual([
      'A1: "Confirmatory trial" will be associated with higher "Accuracy" compared to "Disconfirmatory trial" (this is an auxiliary assumption).',
      'A2: "Confirmatory trial" will be associated with lower "Response time" compared to "Disconfirmatory trial" (this is an auxiliary assumption).',
      'H1a: "Pure logic" will be associated with lower "Confirmation bias effect" (this is the focal hypothesis).',
      'H1b: "Social rule" will be associated with lower "Confirmation bias effect" compared to "Descriptive rule".',
      'H1c: "Precautionary rule" will be associated with lower "Confirmation bias effect" compared to "Descriptive rule".',
      'H2: "Unrealistic rule" will be associated with higher "Confirmation bias effect".',
      'E1a: "Time pressure" will be associated with higher "Confirmation bias effect" (this is exploratory).',
      'E1b: "Time pressure" will be associated with higher "Confirmation bias effect" in the condition of "Unrealistic rule" (this is exploratory).',
      'H3a: "Emotional intelligence" will be associated with higher "Social task advantage" compared to "Confirmation bias effect".',
      'H3b: "Harm avoidance" will be associated with higher "Risk task advantage" compared to "Confirmation bias effect".',
      'H3c: "Confirmation bias effect" will be associated with lower "General intelligence".',
      'H3d: "Confirmation bias effect" will be associated with lower "Education level".',
      'E2: "Cultural emphasis on rationality" will be associated with lower "Confirmation bias effect" (this is exploratory).',
    ]);
  });

  it("matches the sheet's summary counts (3 main, 2 with subsets, 8 total, focal set, 2 auxiliary)", async () => {
    const { project } = await confBias();
    expect(summarySentence(project)).toBe(
      "This study has 3 main hypotheses. Of these, 2 have subordinate hypotheses, for a total of 8 hypotheses. " +
        "A focal hypothesis has been specified. There are also 2 auxiliary assumptions and 3 exploratory tests.",
    );
  });

  it("lists variables by their own role (the sheet's row-shift bug is gone)", async () => {
    const { project } = await confBias();
    const byRole = Object.fromEntries(variableLists(project).map((l) => [l.role, l.names]));
    expect(byRole.predictor).toEqual(["Confirmatory trial", "Disconfirmatory trial"]);
    expect(byRole.manipulated).toEqual([
      "Descriptive rule",
      "Social rule",
      "Precautionary rule",
      "Unrealistic rule",
      "Time pressure",
    ]);
    expect(byRole.outcome).toEqual(["Accuracy", "Response time"]);
    expect(byRole.background).toEqual([
      "Emotional intelligence",
      "Harm avoidance",
      "General intelligence",
      "Education level",
      "Cultural emphasis on rationality",
    ]);
    expect(byRole.control).toEqual(["Pure logic"]);
  });

  it("writes variable definitions", async () => {
    const { project } = await confBias();
    const rt = project.variables.find((v) => v.name === "Response time")!;
    expect(variableDefinition(rt)).toBe(
      'The variable "Response time" is a continuous variable that has the role of effect / outcome / dependent variable in the hypotheses. ' +
        '"Response time" is defined as: Response time for the card selection trial. ' +
        '"Response time" is operationalized as: Time from card presentation of card to pressing either "would turn" or "would not turn". The rule will first be presented alone, before the first card.',
    );
  });

  it("results and discussion templates use the label, past tense and theory", async () => {
    const { project } = await confBias();
    const l = labelHypotheses(project.hypotheses)[5];
    expect(resultsTemplate(project, l)).toContain(
      'Hypothesis H2 stated that "Unrealistic rule" would be associated with higher "Confirmation bias effect".',
    );
    expect(discussionTemplate(project, l)).toContain(
      'We proposed, based on "Experience transfer", that the mechanism of "Real-world knowledge facilitates reasoning" would lead to the "Real-world advantage" effect (hypothesis H2)',
    );
  });
});

describe("labelling", () => {
  it("continues subset letters past d (the sheet stopped at _d)", () => {
    const p = emptyProject();
    p.hypotheses = [newHypothesis({ listing: "main" }), ...Array.from({ length: 6 }, () => newHypothesis({ listing: "subset" }))];
    expect(labelHypotheses(p.hypotheses).map((l) => l.label)).toEqual(["H1a", "H1b", "H1c", "H1d", "H1e", "H1f", "H1g"]);
  });

  it("treats a leading subset row as a main hypothesis", () => {
    const p = emptyProject();
    p.hypotheses = [newHypothesis({ listing: "subset" }), newHypothesis({ listing: "main" })];
    expect(labelHypotheses(p.hypotheses).map((l) => l.label)).toEqual(["H1", "H2"]);
  });

  it("numbers manipulation checks separately", () => {
    const p = emptyProject();
    p.hypotheses = [
      newHypothesis({ listing: "unlisted", kind: "manipulation_check" }),
      newHypothesis({ listing: "unlisted", kind: "manipulation_check" }),
      newHypothesis({ listing: "unlisted" }),
    ];
    expect(labelHypotheses(p.hypotheses).map((l) => l.label)).toEqual(["MC1", "MC2", "U1"]);
  });
});

describe("design table", () => {
  it("fills analysis, sensitivity and interpretation columns", () => {
    const p = emptyProject();
    p.context.researchQuestion = "Does X affect Y?";
    const x = newVariable({ name: "X" });
    const y = newVariable({ name: "Y" });
    p.variables = [x, y];
    p.hypotheses = [
      newHypothesis({
        first: `v:${x.id}`,
        association: "increased",
        second: `v:${y.id}`,
        theoryAtStake: "Theory T",
        samplingPlan: "N = 200 gives 90% power for d = 0.2 one-sided",
        effectSize: { metric: "Cohen's d", sesoi: "0.2", optimistic: "0.5", pessimistic: "0.1", justification: "" },
        inference: { test: "Welch t-test", alpha: ".05", sided: "one", correction: "", bayes: "" },
        falsification: { supports: "d ≥ 0.2, p < .05", falsifies: "90% CI within ±0.2", inconclusive: "otherwise" },
      }),
    ];
    const [row] = designTable(p);
    expect(row.question).toBe("Does X affect Y?");
    expect(row.analysisPlan).toBe("Welch t-test; α = .05; one-sided");
    expect(row.sensitivityRationale).toBe("SESOI (Cohen's d) = 0.2; optimistic bound 0.5; pessimistic bound 0.1");
    expect(row.interpretation).toBe("Support: d ≥ 0.2, p < .05 Falsified: 90% CI within ±0.2 Inconclusive: otherwise");
    expect(row.theoryAtStake).toBe("Theory T");
    expect(row.samplingPlan).toBe("N = 200 gives 90% power for d = 0.2 one-sided");
  });
});
