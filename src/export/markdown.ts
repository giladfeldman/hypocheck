import type { Project } from "../hypothesis/schema.js";
import {
  designTable,
  discussionTemplate,
  hypothesisStatements,
  labelHypotheses,
  resultsTemplate,
  summarySentence,
  variableDefinition,
  variableLists,
} from "../hypothesis/generate.js";
import { packageText, projectPackages } from "../hypothesis/package.js";

function cell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim() || " ";
}

export function projectMarkdown(project: Project): string {
  const c = project.context;
  const lines: string[] = [];
  lines.push(`# ${c.title.trim() || "Hypotheses"}`, "");
  if (c.researchQuestion.trim()) lines.push(`**Research question:** ${c.researchQuestion.trim()}`, "");
  if (c.phenomenon.trim()) lines.push(`**Phenomenon:** ${c.phenomenon.trim()}`, "");
  if (c.population.trim()) lines.push(`**Population:** ${c.population.trim()}`, "");

  // The complete package first: prediction, measures, decision rules; open parts stay "[not specified]".
  const packages = projectPackages(project);
  if (packages.length) lines.push("## Hypotheses, ready to use", "");
  for (const pkg of packages) {
    const text = packageText(pkg);
    // A fence longer than any backtick run in the user's text, so a value cannot close it early.
    const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length));
    const fence = "`".repeat(Math.max(3, longest + 1));
    lines.push(fence, text, fence, "");
  }

  lines.push("## Hypothesis statements", "", summarySentence(project), "");
  for (const s of hypothesisStatements(project)) lines.push(`- ${s}`);
  lines.push("");

  lines.push("## Variables", "");
  for (const l of variableLists(project)) if (l.names.length) lines.push(`- **${l.label}:** ${l.names.join(", ")}`);
  lines.push("");
  for (const v of project.variables.filter((x) => x.name.trim())) lines.push(variableDefinition(v), "");

  lines.push("## Study design table (PCI RR format)", "");
  lines.push(
    "| Question | Hypothesis | Sampling plan | Analysis plan | Rationale for deciding the sensitivity of the test | Interpretation given different outcomes | Theory that could be shown wrong by the outcomes |",
    "|---|---|---|---|---|---|---|",
  );
  for (const r of designTable(project)) {
    lines.push(
      `| ${[r.question, r.hypothesis, r.samplingPlan, r.analysisPlan, r.sensitivityRationale, r.interpretation, r.theoryAtStake].map(cell).join(" | ")} |`,
    );
  }
  lines.push("");

  const labelled = labelHypotheses(project.hypotheses);
  lines.push("## Results-reporting templates", "");
  for (const l of labelled) lines.push(resultsTemplate(project, l), "");
  lines.push("## Discussion templates", "");
  for (const l of labelled) lines.push(discussionTemplate(project, l), "");
  lines.push("---", "Generated with Hypothesizer.");
  return lines.join("\n");
}
