import { describe, expect, it } from "vitest";
import { associationFromLegacy } from "../src/hypothesis/vocab.js";

// Consult 2026-10-13 findings F17/F18: legacy association strings.
describe("associationFromLegacy", () => {
  it.each([
    ["higher than chance level.", "above_chance"],
    ["lower than chance", "below_chance"],
    ["increases", "increased"],
    ["decreases", "decreased"],
    ["not be different from", "same_as"],
    ["will not differ from", "same_as"],
    ["no difference", "same_as"],
    ["not be significantly diffrent from ", "same_as"],
    ["be different from ", "different"],
    ["increase ", "increased"],
  ])("%s → %s", (raw, id) => {
    expect(associationFromLegacy(raw)).toBe(id);
  });
});
