import { ProjectSchema, type Project } from "./schema.js";
import { CONFBIAS_EXAMPLE_DATA } from "./example-confbias.data.js";

/**
 * The worked example from Bjørn Sætrevik and team's Hypothesizer v0.5 sheet
 * (example-confbias.json; regenerate the .data.ts module with `node scripts/build-example-data.mjs`).
 */
export function confBiasExample(): Project {
  return ProjectSchema.parse(structuredClone(CONFBIAS_EXAMPLE_DATA));
}
