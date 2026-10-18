import { describe, expect, it } from "vitest";
import { sha256 } from "../src/index.js";
import { anchorQuote, makeAnchor, normalizeWithMap, validateAnchors, type GraphDocument } from "../src/experimental/index.js";

const TEXT = "Intro. We predict that X increases Y. Later: We predict that X increases Y. End.";

describe("anchorQuote", () => {
  it("anchors a unique exact quote with offsets that re-slice", () => {
    const r = anchorQuote("Alpha. The cue will raise accuracy. Omega.", "The cue will raise accuracy.", { documentId: "d" });
    expect(r.status).toBe("unique");
    const a = r.anchors[0];
    expect("Alpha. The cue will raise accuracy. Omega.".slice(a.start, a.end)).toBe("The cue will raise accuracy.");
    expect(a.matchMethod).toBe("exact");
    expect(a.normalization).toEqual([]);
    expect(a.prefix).toBe("Alpha. ");
    expect(a.suffix).toBe(" Omega.");
  });

  it("returns every candidate as ambiguous for a repeated quote without context", () => {
    const r = anchorQuote(TEXT, "We predict that X increases Y.", { documentId: "d" });
    expect(r.status).toBe("ambiguous");
    expect(r.anchors).toHaveLength(2);
  });

  it("disambiguates repeats by prefix and by suffix", () => {
    const byPrefix = anchorQuote(TEXT, "We predict that X increases Y.", { documentId: "d", prefix: "Later: " });
    expect(byPrefix.status).toBe("unique");
    expect(byPrefix.anchors[0].start).toBe(TEXT.lastIndexOf("We predict"));
    const bySuffix = anchorQuote(TEXT, "We predict that X increases Y.", { documentId: "d", suffix: " Later" });
    expect(bySuffix.status).toBe("unique");
    expect(bySuffix.anchors[0].start).toBe(TEXT.indexOf("We predict"));
  });

  it("matches across whitespace, hyphenation and quote marks, and records the normalization", () => {
    const src = "Method.\nWe predict that participants under time pres-\nsure will show a “stronger”   bias. Next.";
    const r = anchorQuote(src, 'participants under time pressure will show a "stronger" bias', { documentId: "d" });
    expect(r.status).toBe("unique");
    const a = r.anchors[0];
    expect(a.matchMethod).toBe("normalized");
    expect(a.normalization).toContain("dehyphenate");
    expect(src.slice(a.start, a.end)).toBe("participants under time pres-\nsure will show a “stronger”   bias");
    expect(a.exact).toBe(src.slice(a.start, a.end));
  });

  it("does not match a paraphrase, or a very short normalized quote", () => {
    expect(anchorQuote(TEXT, "We expect X to raise Y.", { documentId: "d" }).status).toBe("not_found");
    expect(anchorQuote("A  b", "a b", { documentId: "d" }).status).toBe("not_found");
  });

  it("uses UTF-16 offsets (characters outside the BMP count as two)", () => {
    const src = "😀 é Résumé: the prediction holds here.";
    const r = anchorQuote(src, "the prediction holds", { documentId: "d" });
    expect(r.anchors[0].start).toBe(src.indexOf("the prediction"));
    expect(src.slice(r.anchors[0].start, r.anchors[0].end)).toBe("the prediction holds");
  });

  it("searches only inside `within` but reports document offsets", () => {
    const r = anchorQuote(TEXT, "We predict that X increases Y.", { documentId: "d", within: { start: 30, end: TEXT.length } });
    expect(r.status).toBe("unique");
    expect(r.anchors[0].start).toBe(TEXT.lastIndexOf("We predict"));
  });

  it("assigns the containing section", () => {
    const r = anchorQuote(TEXT, "End.", { documentId: "d", sections: [{ id: "s1", label: "Intro", start: 0, end: 40 }, { id: "s2", label: "Later", start: 40, end: TEXT.length }] });
    expect(r.anchors[0].sectionId).toBe("s2");
  });
});

describe("normalizeWithMap", () => {
  it("maps every normalized character back to an original index", () => {
    const src = "A  “B”—c";
    const n = normalizeWithMap(src);
    expect(n.text).toBe('a "b"-c');
    expect(n.map).toEqual([0, 1, 3, 4, 5, 6, 7]);
  });
});

describe("validateAnchors", () => {
  const doc: GraphDocument = {
    id: "d",
    role: "paper",
    textSha256: sha256(TEXT),
    extractor: { name: "t", version: "1" },
    offsetUnit: "utf16",
    sections: [],
    coverage: { status: "complete", readSectionIds: [], unreadSectionIds: [], skippedSectionIds: [], unavailable: [] },
  };
  const good = makeAnchor(TEXT, "d", 7, 37);

  it("accepts anchors that re-slice (control)", () => {
    expect(validateAnchors([good], { d: TEXT }, { documents: [doc] })).toEqual({ valid: true, problems: [] });
  });
  it("reports a shifted span, an out-of-range span, an unknown document and a changed text", () => {
    const shifted = { ...good, id: "x1", start: good.start + 1, end: good.end + 1 };
    const out = { ...good, id: "x2", end: TEXT.length + 5 };
    const unknown = { ...good, id: "x3", documentId: "nope" };
    const r = validateAnchors([shifted, out, unknown], { d: TEXT }, { documents: [doc] });
    expect(r.valid).toBe(false);
    expect(r.problems.map((p) => [p.anchorId, p.code])).toEqual([
      ["x1", "exact_mismatch"],
      ["x1", "prefix_mismatch"],
      ["x1", "suffix_mismatch"],
      ["x2", "out_of_range"],
      ["x3", "unknown_document"],
    ]);
    const changed = validateAnchors([good], { d: TEXT + " " }, { documents: [doc] });
    expect(changed.problems.map((p) => p.code)).toEqual(["text_hash_mismatch"]);
  });
});
