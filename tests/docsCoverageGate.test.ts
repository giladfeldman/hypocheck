/**
 * Two-sided pin for scripts/check-docs-coverage.mjs. A gate that passes on the real repo proves
 * nothing unless it also FAILS when what it guards is broken.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = path.resolve(process.cwd());
const GATE = path.join(ROOT, "scripts", "check-docs-coverage.mjs");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let gate: any;
let surface: Record<string, Set<string>>;
let all: string;
let readme: string;

beforeAll(async () => {
  gate = await import(pathToFileURL(GATE).href);
  surface = gate.collectSurface();
  all = gate.documentedCodeText();
  readme = gate.documentedCodeText([path.join(ROOT, "README.md")]);
}, 120000);

describe("docs coverage gate", () => {
  it("derives the surface from all four entry points (known-positive control)", () => {
    expect(gate.entryFiles().map((f: string) => path.relative(ROOT, f).replace(/\\/g, "/"))).toEqual([
      "src/index.ts",
      "src/export-docx.ts",
      "src/export-xlsx.ts",
      "src/experimental/index.ts",
    ]);
    expect(surface.export.has("assessAuthoring")).toBe(true);
    expect(surface.export.has("projectDocx")).toBe(true);
    expect(surface.export.has("importLegacyXlsx")).toBe(true);
    expect(surface.export.has("evaluatePublished")).toBe(true);
    expect(surface.member.has("budgetChars")).toBe(true);
    expect(surface.value.has("NOT_ASSESSABLE") || surface.value.has("not_located")).toBe(true);
    expect(surface.parameter.has("policy")).toBe(true);
    expect(surface.export.size).toBeGreaterThan(200);
  });

  it("the real repo is fully documented and its versions agree", () => {
    expect(gate.findUndocumented(surface, all, readme)).toEqual([]);
    expect(gate.checkVersions()).toEqual([]);
  });

  it.each([
    ["export", "plantedUndocumentedExport"],
    ["member", "plantedUndocumentedMember"],
    ["value", "planted_undocumented_value"],
    ["parameter", "plantedUndocumentedParam"],
  ])("a planted undocumented %s is reported", (kind, token) => {
    const planted: Record<string, Set<string>> = {};
    for (const [k, v] of Object.entries(surface)) planted[k] = new Set(v);
    planted[kind].add(token);
    expect(gate.findUndocumented(planted, all, readme)).toEqual([`${kind}: ${token}`]);
  });

  it("an export documented only in docs/, not in the README, is reported", () => {
    const planted: Record<string, Set<string>> = { export: new Set(["OnlyInDocs"]), member: new Set(), value: new Set(), parameter: new Set() };
    expect(gate.findUndocumented(planted, `${all}\nOnlyInDocs`, readme)).toEqual(["export: OnlyInDocs"]);
  });

  it("a prose mention is not documentation; code spans and fences are", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hypocheck-docgate-"));
    try {
      const doc = path.join(tmp, "doc.md");
      fs.writeFileSync(doc, 'A Widget in prose.\r\n\r\n`Gadget` inline.\r\n\r\n```js\r\nimport { Gizmo } from "x";\r\n```\r\n');
      const c = gate.documentedCodeText([doc]);
      expect(gate.isDocumented("Widget", c)).toBe(false);
      expect(gate.isDocumented("Gadget", c)).toBe(true);
      expect(gate.isDocumented("Gizmo", c)).toBe(true);
      expect(gate.isDocumented("Gadge", c)).toBe(false);
      expect(gate.isDocumented("GadgetX", c)).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("end to end: a new undocumented export fails the gate CLI; the untouched copy passes", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hypocheck-docgate-e2e-"));
    try {
      for (const f of ["package.json", "tsconfig.json", "tsconfig.build.json", "README.md", "CHANGELOG.md", "CITATION.cff"]) fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
      for (const d of ["src", "scripts", "docs"]) fs.cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true });
      fs.symlinkSync(path.join(ROOT, "node_modules"), path.join(tmp, "node_modules"), "junction");
      const runGate = () => spawnSync(process.execPath, [path.join(tmp, "scripts", "check-docs-coverage.mjs"), "--no-run"], { cwd: tmp, encoding: "utf8", timeout: 120000 });
      const clean = runGate();
      expect(clean.stdout).toMatch(/^OK: all \d+ public tokens documented/m);
      expect(clean.status).toBe(0);
      fs.appendFileSync(path.join(tmp, "src", "experimental", "index.ts"), "\nexport const plantedUndocumentedExport = 1;\n");
      const planted = runGate();
      expect(planted.stdout).toContain("export: plantedUndocumentedExport");
      expect(planted.status).toBe(1);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 120000);
});
