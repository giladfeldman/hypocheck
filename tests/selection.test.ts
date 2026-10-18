import { describe, expect, it } from "vitest";
import { defaultAccepted } from "../src/extract/selection.js";

// Regression d-e656c8: every extracted item started ticked, including quotes the model
// may have paraphrased or invented.
describe("defaultAccepted", () => {
  it("pre-selects only items whose quote was found verbatim", () => {
    const items = [
      { hypothesisId: "a", quoteVerified: true },
      { hypothesisId: "b", quoteVerified: false },
      { hypothesisId: "c", quoteVerified: true },
    ];
    expect([...defaultAccepted(items)]).toEqual(["a", "c"]);
  });
  it("is empty when nothing is verified", () => {
    expect(defaultAccepted([{ hypothesisId: "x", quoteVerified: false }]).size).toBe(0);
  });
});
