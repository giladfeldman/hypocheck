/**
 * The core entry must stay free of heavy and Node-only dependencies (it runs in browser
 * bundles), and the optional entries must be the only importers of docx / exceljs.
 * Walks the static import graph of each entry's source.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");

function bareImports(entry: string): { files: string[]; bare: Set<string> } {
  const seen = new Set<string>();
  const bare = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)[^;'"]*?from\s+["']([^"']+)["']/g)) {
      const spec = m[1];
      if (spec.startsWith(".")) visit(resolve(dirname(file), spec.replace(/\.js$/, ".ts")));
      else bare.add(spec);
    }
  };
  visit(resolve(SRC, entry));
  return { files: [...seen], bare };
}

describe("entry point dependencies", () => {
  it("core (.) imports only zod (control: the walk finds many files)", () => {
    const { files, bare } = bareImports("index.ts");
    expect(files.length).toBeGreaterThan(10);
    expect([...bare]).toEqual(["zod"]);
  });
  it("experimental imports only zod", () => {
    expect([...bareImports("experimental/index.ts").bare]).toEqual(["zod"]);
  });
  it("export-docx is the only importer of docx; export-xlsx the only importer of exceljs", () => {
    expect([...bareImports("export-docx.ts").bare].sort()).toEqual(["docx", "zod"]);
    expect([...bareImports("export-xlsx.ts").bare].sort()).toEqual(["exceljs", "zod"]);
  });
});
