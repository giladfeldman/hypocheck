/**
 * "hypocheck/export-xlsx": spreadsheet export in the v0.5 layout and the v0.5 importer. Needs the
 * optional peer dependency `exceljs` (`npm install exceljs`); the core entry never imports it.
 * The layout limits (`xlsxLossWarnings` and the row constants) are pure and also exported by the core.
 */
export { projectXlsx } from "./export/xlsx.js";
export { importLegacyXlsx, stripQuotes, type ImportReport } from "./hypothesis/legacy-xlsx.js";
export * from "./export/xlsx-limits.js";
