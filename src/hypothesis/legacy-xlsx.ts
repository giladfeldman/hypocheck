/**
 * Import a Hypothesizer v0.5 spreadsheet (Google Sheets → .xlsx export) into a Project.
 *
 * Layout read (from the v0.5 template):
 *   "State variables"     rows 9–28: A name, B role, C type, D description, E operationalization
 *   "Specify hypotheses"  rows 2–21: A theory, B mechanism, C effect name, D listing,
 *                         E first var, F association, G second var, H qualification,
 *                         I qualifying var, J hypothesis type
 * Variable cells may name a variable or a previously named effect (column C).
 */
import ExcelJS from "exceljs";
import { XLSX_HYPOTHESIS_FIRST_ROW, XLSX_MAX_HYPOTHESES, XLSX_MAX_VARIABLES, XLSX_VARIABLE_FIRST_ROW } from "../export/xlsx-limits.js";
import { emptyProject, newHypothesis, newVariable, type IdOptions, type Project } from "./schema.js";
import {
  associationFromLegacy,
  kindFromLegacy,
  listingFromLegacy,
  qualificationFromLegacy,
  roleFromLegacy,
  typeFromLegacy,
} from "./vocab.js";

export type ImportReport = { project: Project; warnings: string[] };

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    return "";
  }
  return String(v);
}

/** Strip the decorative quote marks the v0.5 instructions recommended around names. */
export function stripQuotes(s: string): string {
  return s.trim().replace(/^["“”]+|["“”]+$/g, "").trim();
}

function key(s: string): string {
  return stripQuotes(s).toLowerCase();
}

export async function importLegacyXlsx(data: ArrayBuffer | Buffer, options: IdOptions = {}): Promise<ImportReport> {
  const wb = new ExcelJS.Workbook();
  // exceljs's typings want its own Buffer type; both inputs are accepted at runtime.
  await wb.xlsx.load(data as unknown as ArrayBuffer);
  const warnings: string[] = [];
  const project = emptyProject();

  const vs = wb.getWorksheet("State variables");
  const hs = wb.getWorksheet("Specify hypotheses");
  if (!vs || !hs) {
    throw new Error(
      'This does not look like a Hypothesizer v0.5 sheet (expected tabs "State variables" and "Specify hypotheses").',
    );
  }

  const varLast = XLSX_VARIABLE_FIRST_ROW + XLSX_MAX_VARIABLES - 1;
  const hypLast = XLSX_HYPOTHESIS_FIRST_ROW + XLSX_MAX_HYPOTHESES - 1;
  // Rows beyond the v0.5 layout are not read; say so instead of dropping them silently.
  // Only for Hypothesizer's own exports (they carry the details tab): the original v0.5
  // template has helper lists below its data rows, which are not data.
  const ownExport = !!wb.getWorksheet("Hypothesizer details");
  const beyond: string[] = [];
  for (let r = varLast + 1; ownExport && r <= vs.rowCount; r++) {
    const name = stripQuotes(cellText(vs.getRow(r).getCell(1).value));
    if (name) beyond.push(name);
  }
  if (beyond.length)
    warnings.push(`Only the first ${XLSX_MAX_VARIABLES} variables (rows ${XLSX_VARIABLE_FIRST_ROW}–${varLast}) were read; not imported: ${beyond.join(", ")}.`);
  let extraHyps = 0;
  for (let r = hypLast + 1; ownExport && r <= hs.rowCount; r++) {
    if (Array.from({ length: 10 }, (_, i) => cellText(hs.getRow(r).getCell(i + 1).value)).some((c) => c.trim())) extraHyps++;
  }
  if (extraHyps)
    warnings.push(`Only the first ${XLSX_MAX_HYPOTHESES} hypothesis rows (rows ${XLSX_HYPOTHESIS_FIRST_ROW}–${hypLast}) were read; ${extraHyps} further row(s) were not imported.`);

  const varByKey = new Map<string, string>();
  for (let r = XLSX_VARIABLE_FIRST_ROW; r <= varLast; r++) {
    const row = vs.getRow(r);
    const name = stripQuotes(cellText(row.getCell(1).value));
    if (!name) continue;
    const roleRaw = cellText(row.getCell(2).value);
    const typeRaw = cellText(row.getCell(3).value);
    const v = newVariable({
      name,
      role: roleFromLegacy(roleRaw) ?? "",
      type: typeFromLegacy(typeRaw) ?? "",
      description: cellText(row.getCell(4).value).trim(),
      operationalization: cellText(row.getCell(5).value).trim(),
    }, options);
    if (roleRaw && !v.role) warnings.push(`Variable "${name}": unknown role "${roleRaw}".`);
    project.variables.push(v);
    varByKey.set(key(name), v.id);
  }

  type Raw = { cells: string[]; row: number };
  const raws: Raw[] = [];
  for (let r = XLSX_HYPOTHESIS_FIRST_ROW; r <= hypLast; r++) {
    const row = hs.getRow(r);
    const cells = Array.from({ length: 10 }, (_, i) => cellText(row.getCell(i + 1).value));
    if (cells.slice(0, 10).every((c) => !c.trim())) continue;
    raws.push({ cells, row: r });
  }

  // First pass: create hypotheses so named effects can be referenced in any row.
  const effectByKey = new Map<string, string>();
  const hyps = raws.map(({ cells }) => {
    const h = newHypothesis({
      theory: stripQuotes(cells[0]),
      mechanism: stripQuotes(cells[1]),
      effectName: stripQuotes(cells[2]),
    }, options);
    if (h.effectName) effectByKey.set(key(h.effectName), h.id);
    return h;
  });

  const resolve = (raw: string, row: number, col: string): string => {
    if (!raw.trim()) return "";
    const k = key(raw);
    const v = varByKey.get(k);
    if (v) return `v:${v}`;
    const h = effectByKey.get(k);
    if (h) return `h:${h}`;
    warnings.push(`Row ${row}, column ${col}: "${stripQuotes(raw)}" is neither a stated variable nor a named effect.`);
    return "";
  };

  raws.forEach(({ cells, row }, i) => {
    const h = hyps[i];
    const listing = listingFromLegacy(cells[3]);
    // The sheet numbered a blank listing as a main hypothesis.
    h.listing = listing ?? "main";
    h.first = resolve(cells[4], row, "E");
    const assoc = associationFromLegacy(cells[5]);
    if (cells[5].trim() && !assoc) warnings.push(`Row ${row}: unknown association "${cells[5].trim()}".`);
    h.association = assoc ?? "";
    h.second = resolve(cells[6], row, "G");
    const qual = qualificationFromLegacy(cells[7]);
    if (cells[7].trim() && !qual) warnings.push(`Row ${row}: unknown qualification "${cells[7].trim()}".`);
    h.qualification = qual ?? "";
    h.qualifier = resolve(cells[8], row, "I");
    h.kind = kindFromLegacy(cells[9]);
    project.hypotheses.push(h);
  });

  // Optional tab written by Hypothesizer's own export: the fields v0.5 has no column for.
  const ds = wb.getWorksheet("Hypothesizer details");
  if (ds) {
    hyps.forEach((h, i) => {
      const c = Array.from({ length: 20 }, (_, j) => cellText(ds.getRow(2 + i).getCell(j + 1).value).trim());
      h.population = c[1];
      h.functionalForm = c[2];
      h.effectSize = { metric: c[3], sesoi: c[4], optimistic: c[5], pessimistic: c[6], justification: c[7] };
      h.samplingPlan = c[8];
      const sided = c[11] === "one" || c[11] === "two" ? c[11] : "";
      h.inference = { test: c[9], alpha: c[10], sided, correction: c[12], bayes: c[13] };
      h.falsification = { supports: c[14], falsifies: c[15], inconclusive: c[16] };
      h.auxiliaryAssumptions = c[17] ? c[17].split("\n").map((x) => x.trim()).filter(Boolean) : [];
      h.derivation = c[18];
      h.theoryAtStake = c[19];
    });
  }

  return { project, warnings };
}
