/**
 * Runs only when HYPOCHECK_CONFBIAS_XLSX points at the original v0.5 ConfBias sheet (not
 * distributed with this library): the bundled example must equal the original's import.
 */
import { describe, expect, it } from "vitest";
import { confBiasExample, type Project } from "../src/index.js";
import { confBias, ORIGIN_SHEET } from "./helpers/confbias.js";

function stripIds(p: Project) {
  const v = new Map(p.variables.map((x) => [x.id, x.name]));
  const h = new Map(p.hypotheses.map((x) => [x.id, x.effectName]));
  const ref = (r: string) => (r.startsWith("v:") ? `v:${v.get(r.slice(2))}` : r.startsWith("h:") ? `h:${h.get(r.slice(2))}` : r);
  return {
    variables: p.variables.map(({ id: _id, ...rest }) => rest),
    hypotheses: p.hypotheses.map(({ id: _id, first, second, qualifier, ...rest }) => ({ ...rest, first: ref(first), second: ref(second), qualifier: ref(qualifier) })),
  };
}

describe.skipIf(!ORIGIN_SHEET)("original v0.5 sheet", () => {
  it("the bundled example equals the import of the original sheet (ids and the added title aside)", async () => {
    const { project, warnings } = await confBias();
    expect(warnings).toEqual([]);
    expect(stripIds(confBiasExample())).toEqual(stripIds(project));
  });
});
