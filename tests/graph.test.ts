import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  GRAPH_FORMAT,
  GRAPH_FORMAT_VERSION,
  GraphSchema,
  checkGraphReferences,
  graphJsonSchema,
  occurrenceId,
  parseGraph,
} from "../src/experimental/index.js";
import { addHypothesis, buildDoc, emptyGraph } from "./helpers/synthetic.js";

const d = buildDoc("paper", [["Introduction", "H1: Practice will increase accuracy."]]);

describe("graph format", () => {
  it("a well-formed graph parses and has no dangling references (control)", () => {
    const g = emptyGraph([d]);
    addHypothesis(g, d, "Practice will increase accuracy.", { direction: ["positive", "Practice will increase accuracy."] });
    expect(parseGraph(g).format).toBe(GRAPH_FORMAT);
    expect(checkGraphReferences(parseGraph(g))).toEqual([]);
  });

  it("rejects an observed value without evidence, a non-namespaced analysis id and an unknown relation", () => {
    const g = emptyGraph([d]);
    const h = addHypothesis(g, d, "Practice will increase accuracy.", {});
    const bad1 = structuredClone(g);
    bad1.hypotheses[0].fields.direction = { state: "observed", value: "positive", evidenceIds: [] };
    expect(GraphSchema.safeParse(bad1).success).toBe(false);
    const bad2 = structuredClone(g);
    bad2.analysisRefs.push({ id: "row 3", anchorIds: [], validation: "unvalidated" });
    expect(GraphSchema.safeParse(bad2).success).toBe(false);
    const bad3 = structuredClone(g) as unknown as { links: unknown[] };
    bad3.links.push({ id: "l", from: h.id, to: h.id, relation: "proves", evidenceIds: [], origin: { kind: "human" }, reviewStatus: "unreviewed" });
    expect(GraphSchema.safeParse(bad3).success).toBe(false);
    const bad4 = structuredClone(g) as unknown as { version: string };
    bad4.version = "1.0.0";
    expect(GraphSchema.safeParse(bad4).success).toBe(false);
  });

  it("checkGraphReferences reports dangling anchors and statements that differ from their anchor", () => {
    const g = emptyGraph([d]);
    addHypothesis(g, d, "Practice will increase accuracy.", {});
    g.hypotheses[0].statement = "Practice will increase accuracy a lot.";
    g.links.push({ id: "l1", from: g.hypotheses[0].id, to: "nope", relation: "tests", evidenceIds: ["missing"], origin: { kind: "human" }, reviewStatus: "unreviewed" });
    expect(checkGraphReferences(g)).toEqual([
      `hypothesis ${g.hypotheses[0].id}: statement differs from its anchor's exact text`,
      "link l1: unknown to nope",
      "link l1: unknown anchor missing",
    ]);
  });

  it("occurrence ids are deterministic and depend on text hash, span and component path", () => {
    const a = occurrenceId("ab", 1, 5, "c0");
    expect(occurrenceId("ab", 1, 5, "c0")).toBe(a);
    expect(occurrenceId("ab", 1, 5, "c1")).not.toBe(a);
    expect(occurrenceId("ac", 1, 5, "c0")).not.toBe(a);
    expect(occurrenceId("ab", 1, 6, "c0")).not.toBe(a);
  });

  it("exports a JSON Schema generated from the zod schema, and the committed copy is current", () => {
    const schema = graphJsonSchema();
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    const props = schema.properties as Record<string, { const?: string }>;
    expect(props.format.const).toBe(GRAPH_FORMAT);
    expect(props.version.const).toBe(GRAPH_FORMAT_VERSION);
    const committed = JSON.parse(readFileSync(new URL(`../schema/hypocheck.graph-${GRAPH_FORMAT_VERSION}.schema.json`, import.meta.url), "utf8"));
    expect(committed).toEqual(schema);
  });
});
