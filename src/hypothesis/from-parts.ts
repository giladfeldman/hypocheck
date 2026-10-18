/**
 * Commit the parts a user CONFIRMED (from parse.ts or chosen by hand) into the one
 * Project model: variables (reusing an existing one with the same name) + a hypothesis.
 * Pure: returns a new project; nothing is inferred beyond what the parts say —
 *   - roles: the predictor / comparison are "predictor", the outcome "outcome"
 *     (that is what the confirmation screen asked: "what varies" / "what you measure");
 *   - type: a named comparison makes the predictor and comparison levels of one
 *     categorical variable; otherwise the type is left for the user;
 *   - primary/focal status and confirmatory/exploratory are left unset.
 */
import { newHypothesis, newVariable, type IdOptions, type Project, type Variable } from "./schema.js";

export type ConfirmedParts = {
  predictor: string;
  outcome: string;
  /** vocab association id; "" = direction not decided yet. */
  association: string;
  comparison?: string;
  population?: string;
};

export function findVariable(project: Project, name: string): Variable | undefined {
  const key = name.trim().toLowerCase();
  if (!key) return undefined;
  return project.variables.find((v) => v.name.trim().toLowerCase() === key);
}

export function addHypothesisFromParts(
  project: Project,
  parts: ConfirmedParts,
  options: IdOptions = {},
): { project: Project; hypothesisId: string; reused: string[] } {
  const p: Project = structuredClone(project);
  const reused: string[] = [];
  const hasComparison = !!parts.comparison?.trim();

  const ensure = (name: string, role: string, type = ""): string => {
    const existing = findVariable(p, name);
    if (existing) {
      reused.push(existing.name);
      return existing.id;
    }
    const v = newVariable({ name: name.trim(), role, type }, options);
    p.variables.push(v);
    return v.id;
  };

  const first = ensure(parts.predictor, "predictor", hasComparison ? "categorical_level" : "");
  const second = ensure(parts.outcome, "outcome");
  const qualifier = hasComparison ? ensure(parts.comparison!, "predictor", "categorical_level") : "";

  const h = newHypothesis({
    listing: "main",
    first: `v:${first}`,
    association: parts.association,
    second: `v:${second}`,
    qualification: hasComparison ? "compared_to" : "",
    qualifier: qualifier ? `v:${qualifier}` : "",
    population: parts.population?.trim() ?? "",
  }, options);
  p.hypotheses.push(h);
  return { project: p, hypothesisId: h.id, reused };
}
