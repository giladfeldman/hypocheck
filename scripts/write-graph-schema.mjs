// Write schema/hypocheck.graph-<version>.schema.json from the zod schema (run after `npm run build`).
// tests/graph.test.ts fails if the committed file differs from what the code generates.
import fs from "node:fs";
import { GRAPH_FORMAT_VERSION, graphJsonSchema } from "../dist/experimental/index.js";

const out = new URL(`../schema/hypocheck.graph-${GRAPH_FORMAT_VERSION}.schema.json`, import.meta.url);
fs.mkdirSync(new URL("../schema/", import.meta.url), { recursive: true });
fs.writeFileSync(out, JSON.stringify(graphJsonSchema(), null, 2) + "\n");
console.log(`wrote ${out.pathname}`);
