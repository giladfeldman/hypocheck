/**
 * hypocheck — stable core. Depends only on zod and runs in Node and in browser bundles.
 * Optional entries: "hypocheck/export-docx", "hypocheck/export-xlsx" (heavy optional peers) and
 * "hypocheck/experimental" (evidence graph, ledger extraction, published-paper evaluator).
 */
export * from "./hypothesis/schema.js";
export * from "./hypothesis/vocab.js";
export * from "./hypothesis/generate.js";
export * from "./hypothesis/parse.js";
export * from "./hypothesis/from-parts.js";
export * from "./hypothesis/package.js";
export { confBiasExample } from "./hypothesis/example.js";
export * from "./quality/citations.js";
export * from "./quality/criteria.js";
export * from "./quality/freetext.js";
export * from "./quality/next-decisions.js";
export * from "./ai/tasks.js";
export * from "./extract/selection.js";
export { projectMarkdown } from "./export/markdown.js";
export * from "./export/xlsx-limits.js";
export * from "./llm.js";
export { sha256, canonicalJson } from "./hash.js";
export { LIBRARY_VERSION } from "./version.js";
