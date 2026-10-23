/**
 * The newer (2026) Hypothesizer sheet: first tab renamed "Describe variables" with its rows moved
 * down (header in row 11), and an "Effect size (optional)" column J that pushes the hypothesis
 * type to K. Built in memory with synthetic content; no sheet is distributed with the library.
 */
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { importLegacyXlsx } from "../src/export-xlsx.js";
import { labelHypotheses, statement } from "../src/index.js";

async function newerTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const vs = wb.addWorksheet("Describe variables");
  vs.getRow(1).getCell(1).value = "How to use the hypothesizer:";
  vs.getRow(9).getCell(1).value = "CC BY-SA-NC:";
  vs.getRow(9).getCell(2).value = "Author and team";
  ["Variable name:", "Variable's role in hypotheses (recommended):", "Select variable type (optional):", "Variable description (optional):", "Variable operationalization (optional):"].forEach(
    (h, i) => (vs.getRow(11).getCell(i + 1).value = h),
  );
  vs.getRow(12).values = ['"Training"', "manipulated variable", "categorical variable level", "Training group.", ""];
  vs.getRow(13).values = ['"Score"', "effect / outcome / dependent variable", "continuous variable", "Test score.", "Items correct."];
  vs.getRow(14).values = ['"Age"', "background / individual variation variable", "continuous variable", "", ""];
  const hs = wb.addWorksheet("Specify hypotheses");
  hs.getRow(1).values = [
    "Theoretical background (optional):", "Mechanism (optional):", "Effect name (optional):", "New or subset hypothesis (optional):",
    "First variable in hypothesis:", "Association", "Second variable in hypothesis:", "Qualification (optional):",
    "Qualifying variable (optional):", "Effect size (optional)", "Hypothesis type (optional):", "#", "#", "_#",
  ];
  hs.getRow(2).values = ['"Learning theory"', "", '"Training effect"', "A main hypothesis", '"Training"', "associated with increased ", '"Score"', " when controlling for ", '"Age"', "medium effect", "the focal hypothesis", 1, "_a", 1];
  hs.getRow(3).values = ["", "", "", "Subset of above hypothesis", '"Age"', "associated with decreased ", '"Score"', "", "", "", "", 1, "_b", 2];
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("importLegacyXlsx: newer template", () => {
  it("reads the renamed tab, the moved variable rows and the effect-size column", async () => {
    const { project, warnings } = await importLegacyXlsx(await newerTemplate());
    expect(warnings).toEqual([]);
    expect(project.variables.map((v) => [v.name, v.role, v.type])).toEqual([
      ["Training", "manipulated", "categorical_level"],
      ["Score", "outcome", "continuous"],
      ["Age", "background", "continuous"],
    ]);
    const [h1, h2] = project.hypotheses;
    expect([h1.association, h1.qualification, h1.kind, h1.effectSize.optimistic, h1.listing]).toEqual(["increased", "controlling_for", "focal", "medium effect", "main"]);
    expect([h2.association, h2.kind, h2.effectSize.optimistic, h2.listing]).toEqual(["decreased", "", "", "subset"]);
    expect(labelHypotheses(project.hypotheses).map((l) => statement(project, l))).toEqual([
      'H1a: "Training" will be associated with higher "Score" when controlling for "Age" (this is the focal hypothesis).',
      'H1b: "Age" will be associated with lower "Score".',
    ]);
  });
});
