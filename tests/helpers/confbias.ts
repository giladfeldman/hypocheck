/**
 * The ConfBias golden fixture.
 *
 * The original v0.5 spreadsheet (Bjørn Sætrevik and team) is not distributed with this public
 * library. By default the golden tests load the bundled example (example-confbias.json, which the
 * Hypothesizer app derived from that sheet) through a full xlsx round trip: export to the v0.5
 * layout, then `importLegacyXlsx`. Set HYPOCHECK_CONFBIAS_XLSX to the original sheet's path to run
 * the same tests against the original file; tests/origin-sheet.test.ts then also checks that the
 * bundled example equals the original import.
 */
import { readFileSync } from "node:fs";
import { confBiasExample } from "../../src/index.js";
import { importLegacyXlsx, projectXlsx, type ImportReport } from "../../src/export-xlsx.js";

export const ORIGIN_SHEET: string | undefined = process.env.HYPOCHECK_CONFBIAS_XLSX || undefined;

export const CONFBIAS_SOURCE = ORIGIN_SHEET ? "original v0.5 sheet" : "bundled example via xlsx round trip";

export async function confBiasXlsx(): Promise<Buffer> {
  if (ORIGIN_SHEET) return readFileSync(ORIGIN_SHEET);
  return projectXlsx(confBiasExample());
}

export async function confBias(): Promise<ImportReport> {
  return importLegacyXlsx(await confBiasXlsx());
}
