import { describe, expect, it } from "vitest";
import { addHypothesisFromParts } from "../src/hypothesis/from-parts.js";
import { parseHypothesisSentence } from "../src/hypothesis/parse.js";
import { emptyProject, newVariable, ProjectSchema } from "../src/hypothesis/schema.js";
import { labelHypotheses, statement } from "../src/hypothesis/generate.js";
import { hypothesisPackage, NOT_SPECIFIED, packageText, projectPackageText } from "../src/hypothesis/package.js";
import { confBiasExample } from "../src/hypothesis/example.js";

describe("addHypothesisFromParts", () => {
  it("sleep example: parse → confirm → one hypothesis with two new variables, nothing invented", () => {
    const r = parseHypothesisSentence("Students who sleep longer will have higher examination scores.");
    const before = emptyProject();
    const { project, hypothesisId, reused } = addHypothesisFromParts(before, {
      predictor: r.parts.predictor!.text,
      outcome: r.parts.outcome!.text,
      association: r.parts.relationship!.association,
      population: r.parts.population?.text,
    });
    expect(before.hypotheses).toHaveLength(0); // pure
    expect(reused).toEqual([]);
    expect(project.variables.map((v) => [v.name, v.role, v.type])).toEqual([
      ["sleep longer", "predictor", ""],
      ["examination scores", "outcome", ""],
    ]);
    const h = project.hypotheses[0];
    expect(h.id).toBe(hypothesisId);
    expect(h.kind).toBe(""); // primary status left unset
    expect(h.qualification).toBe(""); // no comparison invented
    expect(h.population).toBe("Students");
    expect(statement(project, labelHypotheses(project.hypotheses)[0])).toBe('H1: "sleep longer" will be associated with higher "examination scores".');
    expect(ProjectSchema.safeParse(project).success).toBe(true);
  });

  it("reuses an existing variable with the same name (case-insensitive)", () => {
    const p = emptyProject();
    p.variables.push(newVariable({ name: "Anxiety", role: "outcome", operationalization: "GAD-7" }));
    const { project, reused } = addHypothesisFromParts(p, { predictor: "Women", outcome: "anxiety", association: "increased", comparison: "men" });
    expect(reused).toEqual(["Anxiety"]);
    expect(project.variables).toHaveLength(3);
    const h = project.hypotheses[0];
    expect(h.second).toBe(`v:${p.variables[0].id}`);
    expect(h.qualification).toBe("compared_to");
    // a named comparison makes both sides levels of one categorical variable
    expect(project.variables.find((v) => v.name === "Women")?.type).toBe("categorical_level");
  });

  it("keeps an undecided direction as an empty association", () => {
    const { project } = addHypothesisFromParts(emptyProject(), { predictor: "Sleep", outcome: "Mood", association: "" });
    expect(project.hypotheses[0].association).toBe("");
  });
});

describe("hypothesis package", () => {
  it("marks every unresolved part as [not specified]", () => {
    const { project } = addHypothesisFromParts(emptyProject(), { predictor: "sleep longer", outcome: "examination scores", association: "increased" });
    const pkg = hypothesisPackage(project, labelHypotheses(project.hypotheses)[0]);
    expect(pkg.prediction).toBe('"sleep longer" will be associated with higher "examination scores".');
    const text = packageText(pkg);
    expect(text).toContain("Who: [not specified]");
    expect(text).toContain("  sleep longer: [not specified]");
    expect(text).toContain("  Counts against: [not specified]");
    expect(text).toContain(`Smallest effect that would matter: ${NOT_SPECIFIED}`);
  });

  it("fills specified parts and the study population as fallback", () => {
    const { project } = addHypothesisFromParts(emptyProject(), { predictor: "Sleep", outcome: "Score", association: "increased" });
    project.context.population = "Undergraduates";
    project.variables[0].operationalization = "Actigraphy";
    project.hypotheses[0].falsification.falsifies = "90% CI within ±0.1";
    project.hypotheses[0].effectSize = { metric: "r", sesoi: "0.1", optimistic: "", pessimistic: "", justification: "" };
    const text = packageText(hypothesisPackage(project, labelHypotheses(project.hypotheses)[0]));
    expect(text).toContain("Who: Undergraduates");
    expect(text).toContain("  Sleep: Actigraphy");
    expect(text).toContain("  Score: [not specified]");
    expect(text).toContain("Counts against: 90% CI within ±0.1");
    expect(text).toContain("Smallest effect that would matter: r 0.1");
  });

  it("works on the worked example (named effects are not listed as measures)", () => {
    const text = projectPackageText(confBiasExample());
    expect(text.split("\n\n")).toHaveLength(13);
    expect(text).toContain("H2.");
  });
});
