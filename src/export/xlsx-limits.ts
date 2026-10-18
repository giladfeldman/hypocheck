/**
 * What the v0.5 spreadsheet layout can hold, and what a project would lose in it.
 *
 * The v0.5 sheet has 20 variable rows ("State variables" rows 9–28) and 20 hypothesis
 * rows ("Specify hypotheses" rows 2–21), and no place for the study context or notes.
 * The XLSX export keeps that layout so the file still works in the original sheet;
 * this module says out loud what does not fit (d-5dd476). The .json project file is the
 * complete backup. Kept free of exceljs so the UI can import it.
 */
import type { Project } from "../hypothesis/schema.js";

export const XLSX_VARIABLE_FIRST_ROW = 9;
export const XLSX_HYPOTHESIS_FIRST_ROW = 2;
export const XLSX_MAX_VARIABLES = 20;
export const XLSX_MAX_HYPOTHESES = 20;

const CONTEXT_LABELS: Record<keyof Project["context"], string> = {
  title: "title",
  researchQuestion: "research question",
  phenomenon: "phenomenon",
  population: "population",
  discipline: "discipline",
  design: "design",
  samplingPlan: "sampling plan",
  dag: "causal graph",
};

/** Plain-language list of what the v0.5-layout spreadsheet will not contain. Empty = nothing lost. */
export function xlsxLossWarnings(project: Project): string[] {
  const out: string[] = [];
  const named = project.variables.filter((v) => v.name.trim());
  if (named.length > XLSX_MAX_VARIABLES) {
    const extra = named.slice(XLSX_MAX_VARIABLES).map((v) => v.name.trim());
    out.push(
      `The project has ${named.length} variables; the v0.5 layout holds only the first ${XLSX_MAX_VARIABLES}, so these will not be re-imported: ${extra.join(", ")}.`,
    );
  }
  const unnamed = project.variables.length - named.length;
  if (unnamed) out.push(`${unnamed} variable row(s) without a name will not be re-imported.`);
  if (project.hypotheses.length > XLSX_MAX_HYPOTHESES)
    out.push(
      `The project has ${project.hypotheses.length} hypotheses; the v0.5 layout holds only the first ${XLSX_MAX_HYPOTHESES}, so the rest will not be re-imported.`,
    );
  const ctx = (Object.keys(CONTEXT_LABELS) as (keyof Project["context"])[]).filter((k) => project.context[k].trim());
  if (ctx.length) out.push(`The study context (${ctx.map((k) => CONTEXT_LABELS[k]).join(", ")}) has no place in the spreadsheet.`);
  const withNotes = project.hypotheses.filter((h) => h.notes.trim()).length;
  if (withNotes) out.push(`Notes on ${withNotes} hypothesis/hypotheses have no place in the spreadsheet.`);
  return out;
}
