import { describe, expect, it } from "vitest";
import { importLegacyXlsx } from "../src/export-xlsx.js";
import { hypothesisStatements } from "../src/hypothesis/generate.js";
import { emptyProject, newHypothesis, newVariable } from "../src/hypothesis/schema.js";
import { projectXlsx } from "../src/export/xlsx.js";
import { xlsxLossWarnings } from "../src/export/xlsx-limits.js";
import { projectMarkdown } from "../src/export/markdown.js";
import { projectDocx } from "../src/export/docx.js";

import { confBiasXlsx } from "./helpers/confbias.js";

/** Compare projects ignoring generated ids. */
function strip(p: Awaited<ReturnType<typeof importLegacyXlsx>>["project"]) {
  const vName = new Map(p.variables.map((v) => [v.id, v.name]));
  const hName = new Map(p.hypotheses.map((h) => [h.id, `effect:${h.effectName}`]));
  const ref = (r: string) => (r.startsWith("v:") ? vName.get(r.slice(2)) : r.startsWith("h:") ? hName.get(r.slice(2)) : r);
  return {
    variables: p.variables.map(({ id: _id, ...rest }) => rest),
    hypotheses: p.hypotheses.map(({ id: _id, first, second, qualifier, ...rest }) => ({
      ...rest,
      first: ref(first),
      second: ref(second),
      qualifier: ref(qualifier),
    })),
  };
}

describe("xlsx round-trip", () => {
  it("export → import reproduces the ConfBias project, including fields v0.5 lacks", async () => {
    const { project } = await importLegacyXlsx(await confBiasXlsx());
    const h = project.hypotheses[2];
    h.effectSize = { metric: "Cohen's d", sesoi: "0.2", optimistic: "0.5", pessimistic: "0.1", justification: "prior work" };
    h.inference = { test: "Welch t-test", alpha: ".05", sided: "one", correction: "Holm", bayes: "BF10 > 6" };
    h.falsification = { supports: "s", falsifies: "f", inconclusive: "i" };
    h.auxiliaryAssumptions = ["Participants understand the rule", "No ceiling effect"];
    h.derivation = "d";
    h.theoryAtStake = "t";
    h.samplingPlan = "N = 300";
    project.variables[0].type = "ordinal";
    project.variables[1].role = "mediator";

    const buf = await projectXlsx(project);
    const back = await importLegacyXlsx(buf);
    expect(back.warnings).toEqual([]);
    expect(strip(back.project)).toEqual(strip(project));
    expect(hypothesisStatements(back.project)).toEqual(hypothesisStatements(project));
  });
});

// Regression d-5dd476: the v0.5 layout holds 20 variables and 20 hypotheses and has no
// place for the study context or notes; the round-trip used to drop them silently.
describe("xlsx limits are surfaced, not silent", () => {
  it("the ConfBias project fits the v0.5 layout (no warnings)", async () => {
    const { project } = await importLegacyXlsx(await confBiasXlsx());
    expect(xlsxLossWarnings(project)).toEqual([]);
  });

  it("warns about variable 21+, hypothesis 21+, study context and notes", () => {
    const p = emptyProject();
    p.variables = Array.from({ length: 21 }, (_, i) => newVariable({ name: `V${i + 1}` }));
    p.hypotheses = Array.from({ length: 21 }, () => newHypothesis({ first: `v:${p.variables[0].id}`, association: "increased", second: `v:${p.variables[1].id}` }));
    p.hypotheses[3].notes = "keep me";
    p.context.title = "My study";
    p.context.samplingPlan = "N = 200";
    const w = xlsxLossWarnings(p).join("\n");
    expect(w).toMatch(/21 variables.*only the first 20/);
    expect(w).toMatch(/V21/);
    expect(w).toMatch(/21 hypotheses.*only the first 20/);
    expect(w).toMatch(/study context/i);
    expect(w).toMatch(/notes/i);
  });

  it("the importer reports rows beyond the v0.5 layout instead of dropping them silently", async () => {
    const p = emptyProject();
    p.variables = Array.from({ length: 21 }, (_, i) => newVariable({ name: `V${i + 1}` }));
    const back = await importLegacyXlsx(await projectXlsx(p));
    expect(back.project.variables).toHaveLength(20);
    expect(back.warnings.join("\n")).toMatch(/V21/);
  });
});

describe("markdown and docx", () => {
  it("markdown contains statements and the 7-column PCI RR table", async () => {
    const { project } = await importLegacyXlsx(await confBiasXlsx());
    const md = projectMarkdown(project);
    expect(md).toContain('- H2: "Unrealistic rule" will be associated with higher "Confirmation bias effect".');
    expect(md).toContain("| Question | Hypothesis | Sampling plan | Analysis plan | Rationale for deciding the sensitivity of the test | Interpretation given different outcomes | Theory that could be shown wrong by the outcomes |");
    expect(md.match(/^\| .* \|$/gm)!.length).toBe(1 + 13); // header + one row per hypothesis
  });

  it("docx is a valid zip containing the statements", async () => {
    const { project } = await importLegacyXlsx(await confBiasXlsx());
    const buf = await projectDocx(project);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Unrealistic rule");
    expect(xml).toContain("Theory that could be shown wrong by the outcomes");
    expect(xml).toContain("Hypotheses, ready to use");
    expect(xml).toContain("Counts against: [not specified]");
  });

  it("both lead with the hypothesis package and keep open parts as [not specified]", async () => {
    const { project } = await importLegacyXlsx(await confBiasXlsx());
    const md = projectMarkdown(project);
    expect(md.indexOf("## Hypotheses, ready to use")).toBeLessThan(md.indexOf("## Hypothesis statements"));
    expect(md).toContain('H2. "Unrealistic rule" will be associated with higher "Confirmation bias effect".');
    expect(md).toContain("  Counts against: [not specified]");
  });
});
