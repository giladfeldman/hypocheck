/**
 * Which extracted hypotheses start ticked on the extraction page. Only items whose
 * quote was found verbatim in the source are pre-selected; an unverified quote may be
 * paraphrased or invented by the model, so the user has to tick it explicitly
 * (d-e656c8). A verified quote still does not mean the inferred structure is right.
 */
export function defaultAccepted(items: readonly { hypothesisId: string; quoteVerified: boolean }[]): Set<string> {
  return new Set(items.filter((i) => i.quoteVerified).map((i) => i.hypothesisId));
}
