import { ProjectSchema, type Project } from "./schema.js";
import { CONFBIAS_EXAMPLE_DATA } from "./example-confbias.data.js";
import { DISSONANCE_EXAMPLE_DATA } from "./example-dissonance.data.js";

/**
 * The original worked example from Bjørn Sætrevik and team's Hypothesizer v0.5 sheet: confirmation
 * bias in the Wason selection task (example-confbias.json). The golden tests are built on it.
 * Regenerate the .data.ts modules with `node scripts/build-example-data.mjs`.
 */
export function confBiasExample(): Project {
  return ProjectSchema.parse(structuredClone(CONFBIAS_EXAMPLE_DATA));
}

/**
 * The current worked example from Bjørn Sætrevik and team's Hypothesizer v0.52 sheet: cognitive
 * dissonance and attitude change (example-dissonance.json), with a manipulation check, a focal
 * hypothesis with a sub-hypothesis, and a second main hypothesis. Imported from the sheet as updated
 * 2026-10-23 (freedom-of-choice cutoff: 4 or higher on the 1-7 scale); the title and research question
 * are added, and the effect-name typo "chance" reads "change".
 */
export function dissonanceExample(): Project {
  return ProjectSchema.parse(structuredClone(DISSONANCE_EXAMPLE_DATA));
}
