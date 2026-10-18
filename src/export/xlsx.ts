/**
 * XLSX export in the v0.5 layout (so the file opens in the original spreadsheet
 * workflow and re-imports here), plus a "Hypothesizer details" tab carrying the
 * fields the v0.5 sheet has no column for.
 *
 * Not a complete backup: the layout holds 20 variables and 20 hypotheses and has no
 * place for the study context or notes. xlsxLossWarnings (xlsx-limits.ts) lists what a
 * given project would lose; the UI shows it next to the download.
 */
import ExcelJS from "exceljs";
import type { Project } from "../hypothesis/schema.js";
import { refName } from "../hypothesis/generate.js";
import { ASSOCIATIONS, HYPOTHESIS_KINDS, LISTINGS, QUALIFICATIONS, VARIABLE_ROLES, VARIABLE_TYPES } from "../hypothesis/vocab.js";

const LEGACY_ROLE: Record<string, string> = {
  predictor: "predictor / causal / independent variable",
  manipulated: "manipulated variable",
  outcome: "effect / outcome / dependent variable",
  background: "background / individual variation variable",
  control: "control / covariate variable",
};
const LEGACY_TYPE: Record<string, string> = { continuous: "continuous variable", categorical_level: "categorical variable level" };
const LEGACY_ASSOC: Record<string, string> = {
  increased: "increased",
  more_frequent: "more frequent",
  decreased: "decreased",
  less_frequent: "less frequent",
  different: "be different from",
  interaction: "have an interaction with",
  moderates: "moderate",
  same_as: "be the same as",
  above_chance: "above chance level",
  below_chance: "below chance level",
};
const LEGACY_KIND: Record<string, string> = {
  focal: "the focal hypothesis",
  auxiliary: "an auxiliary assumption",
  manipulation_check: "a manipulation check",
  exploratory: "exploratory",
};

export async function projectXlsx(project: Project): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Hypothesizer";

  const vs = wb.addWorksheet("State variables");
  vs.getCell("A1").value = "Exported from Hypothesizer. Variables start at row 9 (v0.5 layout).";
  ["Variable name:", "Variable's role in hypotheses (recommended):", "Select variable type (optional):", "Variable description (optional):", "Variable operationalization (optional):"].forEach(
    (h, i) => (vs.getRow(8).getCell(i + 1).value = h),
  );
  project.variables.forEach((v, i) => {
    const row = vs.getRow(9 + i);
    row.getCell(1).value = v.name;
    row.getCell(2).value = LEGACY_ROLE[v.role] ?? VARIABLE_ROLES.find((r) => r.id === v.role)?.label ?? "";
    row.getCell(3).value = LEGACY_TYPE[v.type] ?? VARIABLE_TYPES.find((t) => t.id === v.type)?.label ?? "";
    row.getCell(4).value = v.description;
    row.getCell(5).value = v.operationalization;
  });
  vs.columns.forEach((c) => (c.width = 32));

  const hs = wb.addWorksheet("Specify hypotheses");
  [
    "Theoretical background (optional):",
    "Mechanism (optional):",
    "Effect name (optional):",
    "New or subset hypothesis (optional):",
    "First variable in hypothesis:",
    "Association",
    "Second variable in hypothesis:",
    "Qualification (optional):",
    "Qualifying variable (optional):",
    "Hypothesis type (optional):",
  ].forEach((h, i) => (hs.getRow(1).getCell(i + 1).value = h));
  project.hypotheses.forEach((h, i) => {
    const row = hs.getRow(2 + i);
    row.getCell(1).value = h.theory;
    row.getCell(2).value = h.mechanism;
    row.getCell(3).value = h.effectName;
    row.getCell(4).value = LISTINGS.find((l) => l.id === h.listing)?.label.replace("the hypothesis above", "above hypothesis") ?? "";
    row.getCell(5).value = refName(project, h.first);
    row.getCell(6).value = LEGACY_ASSOC[h.association] ?? ASSOCIATIONS.find((a) => a.id === h.association)?.label ?? "";
    row.getCell(7).value = refName(project, h.second);
    row.getCell(8).value = QUALIFICATIONS.find((q) => q.id === h.qualification)?.label ?? "";
    row.getCell(9).value = refName(project, h.qualifier);
    // Blank = confirmatory, not focal (as in v0.5); never write a label containing "focal" for it.
    row.getCell(10).value = h.kind ? (LEGACY_KIND[h.kind] ?? HYPOTHESIS_KINDS.find((k) => k.id === h.kind)?.label ?? "") : "";
  });
  hs.columns.forEach((c) => (c.width = 28));

  const ds = wb.addWorksheet("Hypothesizer details");
  const cols = [
    "Effect name",
    "Population / boundary",
    "Functional form",
    "Effect-size metric",
    "SESOI",
    "Optimistic bound",
    "Pessimistic bound",
    "Effect-size justification",
    "Sampling plan",
    "Test",
    "Alpha",
    "Sided",
    "Correction",
    "Bayesian criterion",
    "Supports if",
    "Falsified if",
    "Inconclusive if",
    "Auxiliary assumptions",
    "Derivation from theory",
    "Theory at stake",
  ];
  cols.forEach((h, i) => (ds.getRow(1).getCell(i + 1).value = h));
  project.hypotheses.forEach((h, i) => {
    const vals = [
      h.effectName,
      h.population,
      h.functionalForm,
      h.effectSize.metric,
      h.effectSize.sesoi,
      h.effectSize.optimistic,
      h.effectSize.pessimistic,
      h.effectSize.justification,
      h.samplingPlan,
      h.inference.test,
      h.inference.alpha,
      h.inference.sided,
      h.inference.correction,
      h.inference.bayes,
      h.falsification.supports,
      h.falsification.falsifies,
      h.falsification.inconclusive,
      h.auxiliaryAssumptions.join("\n"),
      h.derivation,
      h.theoryAtStake,
    ];
    vals.forEach((v, j) => (ds.getRow(2 + i).getCell(j + 1).value = v));
  });

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
