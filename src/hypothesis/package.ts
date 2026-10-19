/**
 * The "use your hypothesis" package: prediction + measures + decision rules, with every
 * unresolved part shown as "[not specified]" so a draft never reads as a complete
 * scientific statement (design review 2026-10-18). Pure.
 */
import type { Project } from "./schema.js";
import { labelHypotheses, predictionSentence, refName, type Labelled } from "./generate.js";

export const NOT_SPECIFIED = "[not specified]";

export type HypothesisPackage = {
  label: string;
  prediction: string;
  population: string | null;
  comparison: string | null;
  measures: { name: string; how: string | null }[];
  smallestEffect: string | null;
  test: string | null;
  rules: { supports: string | null; against: string | null; inconclusive: string | null };
};

// One line per value: a newline inside a user value would break the package's line layout.
const val = (s: string | undefined) => (s && s.trim() ? s.trim().replace(/\s*\n\s*/g, " ") : null);

export function hypothesisPackage(project: Project, l: Labelled): HypothesisPackage {
  const h = l.hypothesis;
  const sentence = predictionSentence(project, h);
  const measures = [h.first, h.second, h.qualifier]
    .filter((r) => r.startsWith("v:"))
    .map((r) => project.variables.find((v) => v.id === r.slice(2)))
    .filter((v, i, arr) => v && v.name.trim() && arr.indexOf(v) === i)
    .map((v) => ({ name: v!.name.trim(), how: val(v!.operationalization) }));
  const es = h.effectSize;
  const bounds =
    val(es.sesoi) !== null
      ? `${es.metric ? `${es.metric} ` : ""}${es.sesoi.trim()}`
      : val(es.optimistic) && val(es.pessimistic)
        ? `between ${es.pessimistic.trim()} (pessimistic) and ${es.optimistic.trim()} (optimistic)${es.metric ? ` on ${es.metric}` : ""}`
        : null;
  const inf = h.inference;
  const test = val([inf.test, inf.alpha && `α = ${inf.alpha}`, inf.sided && `${inf.sided}-sided`, inf.bayes].filter(Boolean).join("; "));
  return {
    label: l.label,
    prediction: `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}.`,
    population: val(h.population) ?? val(project.context.population),
    comparison: h.qualification === "compared_to" && h.qualifier ? val(refName(project, h.qualifier)) : null,
    measures,
    smallestEffect: bounds,
    test,
    rules: { supports: val(h.falsification.supports), against: val(h.falsification.falsifies), inconclusive: val(h.falsification.inconclusive) },
  };
}

const ns = (v: string | null) => v ?? NOT_SPECIFIED;

export function packageText(pkg: HypothesisPackage): string {
  const lines = [
    `${pkg.label}. ${pkg.prediction}`,
    `Who: ${ns(pkg.population)}`,
    "Measures:",
    ...(pkg.measures.length ? pkg.measures.map((m) => `  ${m.name}: ${ns(m.how)}`) : [`  ${NOT_SPECIFIED}`]),
    `Smallest effect that would matter: ${ns(pkg.smallestEffect)}`,
    `Test and threshold: ${ns(pkg.test)}`,
    "Decision rules:",
    `  Supports: ${ns(pkg.rules.supports)}`,
    `  Counts against: ${ns(pkg.rules.against)}`,
    `  Inconclusive: ${ns(pkg.rules.inconclusive)}`,
  ];
  return lines.join("\n");
}

export function projectPackages(project: Project): HypothesisPackage[] {
  return labelHypotheses(project.hypotheses).map((l) => hypothesisPackage(project, l));
}

export function projectPackageText(project: Project): string {
  return projectPackages(project).map(packageText).join("\n\n");
}
