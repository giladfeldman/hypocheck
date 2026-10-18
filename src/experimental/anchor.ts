/**
 * Anchoring quotes to exact source spans, and checking anchors against the text they claim.
 *
 * Concepts follow the W3C Web Annotation TextQuoteSelector (exact + prefix + suffix) and
 * TextPositionSelector (start/end), with zero-based end-exclusive UTF-16 offsets. This is a
 * conceptual alignment, not a W3C serialization.
 */
import { sha256 } from "../hash.js";
import type { Anchor, GraphDocument, NormalizationStep, Section } from "./graph.js";

export const ALL_NORMALIZATION_STEPS: NormalizationStep[] = ["dehyphenate", "quotes", "dashes", "whitespace", "case"];

interface Normalized {
  text: string;
  /** map[i] = index in the original string of normalized char i. */
  map: number[];
}

/**
 * Normalize text for matching while keeping a map back to original offsets.
 * Steps: de-hyphenate line breaks ("pres-\nsure" → "pressure"), unify quote marks and dashes,
 * collapse whitespace runs to one space, lower-case (only where it keeps the length).
 */
export function normalizeWithMap(text: string, steps: NormalizationStep[] = ALL_NORMALIZATION_STEPS): Normalized {
  const on = new Set(steps);
  const out: string[] = [];
  const map: number[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (on.has("dehyphenate") && ch === "-") {
      const m = /^-[ \t]*\r?\n\s*/.exec(text.slice(i, i + 40));
      if (m && i > 0 && /\p{L}/u.test(text[i - 1]) && /\p{L}/u.test(text[i + m[0].length] ?? "")) {
        i += m[0].length;
        continue;
      }
    }
    if (on.has("whitespace") && /\s/.test(ch)) {
      let j = i;
      while (j < text.length && /\s/.test(text[j])) j++;
      out.push(" ");
      map.push(i);
      i = j;
      continue;
    }
    let c = ch;
    if (on.has("quotes")) c = c.replace(/[“”«»„‟″]/g, '"').replace(/[‘’‚‛′]/g, "'");
    if (on.has("dashes")) c = c.replace(/[‐‑‒–—―−]/g, "-");
    if (on.has("case")) {
      const lower = c.toLowerCase();
      if (lower.length === c.length) c = lower;
    }
    out.push(c);
    map.push(i);
    i++;
  }
  return { text: out.join(""), map };
}

function allIndexes(hay: string, needle: string): number[] {
  const out: number[] = [];
  if (!needle) return out;
  let i = hay.indexOf(needle);
  while (i >= 0) {
    out.push(i);
    i = hay.indexOf(needle, i + 1);
  }
  return out;
}

export interface AnchorQuoteOptions {
  documentId: string;
  /** Context the caller expects before / after the quote; used to choose among repeats. */
  prefix?: string;
  suffix?: string;
  /** Characters of context stored on each anchor (default 32). */
  contextChars?: number;
  sections?: Section[];
  /** Restrict the search to text[within.start, within.end). Offsets stay document offsets. */
  within?: { start: number; end: number };
  /** Allow a normalized match when there is no exact one (default true). */
  allowNormalized?: boolean;
  /** Minimum normalized quote length for a normalized match (default 15, as `quoteIsVerbatim`). */
  minNormalizedLength?: number;
}

export interface AnchorQuoteResult {
  /** unique = one span chosen; ambiguous = several equally good spans (all returned); not_found = none. */
  status: "unique" | "ambiguous" | "not_found";
  anchors: Anchor[];
}

/** Id of an anchor: hash of document id and span. */
export function anchorId(documentId: string, start: number, end: number): string {
  return `a_${sha256(`${documentId}:${start}:${end}`).slice(0, 20)}`;
}

/** The section whose range contains `start` (innermost when nested). */
export function sectionAt(sections: Section[] | undefined, start: number): Section | undefined {
  let best: Section | undefined;
  for (const s of sections ?? []) {
    if (start >= s.start && start < s.end && (!best || s.end - s.start < best.end - best.start)) best = s;
  }
  return best;
}

/** Build an anchor for a known span. */
export function makeAnchor(
  text: string,
  documentId: string,
  start: number,
  end: number,
  options: { contextChars?: number; sections?: Section[]; matchMethod?: "exact" | "normalized"; normalization?: NormalizationStep[] } = {},
): Anchor {
  const ctx = options.contextChars ?? 32;
  const section = sectionAt(options.sections, start);
  return {
    id: anchorId(documentId, start, end),
    documentId,
    start,
    end,
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - ctx), start),
    suffix: text.slice(end, end + ctx),
    ...(section ? { sectionId: section.id } : {}),
    matchMethod: options.matchMethod ?? "exact",
    normalization: options.matchMethod === "normalized" ? (options.normalization ?? ALL_NORMALIZATION_STEPS) : [],
  };
}

function contextScore(text: string, start: number, end: number, prefix?: string, suffix?: string): number {
  const norm = (s: string) => normalizeWithMap(s).text;
  let score = 0;
  if (prefix) {
    const want = norm(prefix);
    const have = norm(text.slice(Math.max(0, start - prefix.length - 20), start));
    let k = 0;
    while (k < want.length && k < have.length && want[want.length - 1 - k] === have[have.length - 1 - k]) k++;
    score += k;
  }
  if (suffix) {
    const want = norm(suffix);
    const have = norm(text.slice(end, end + suffix.length + 20));
    let k = 0;
    while (k < want.length && k < have.length && want[k] === have[k]) k++;
    score += k;
  }
  return score;
}

/**
 * Find `quote` in `text` and return anchors with exact offsets. Exact matches are preferred; a
 * normalized match (whitespace, hyphenation, quote marks, dashes, case) is recorded as such.
 * Repeated quotes are disambiguated by `prefix`/`suffix`; if that does not single one out, every
 * candidate is returned with status "ambiguous" — the caller must not pick one silently.
 */
export function anchorQuote(text: string, quote: string, options: AnchorQuoteOptions): AnchorQuoteResult {
  const lo = options.within?.start ?? 0;
  const hi = options.within?.end ?? text.length;
  const region = text.slice(lo, hi);
  const q = quote.trim();
  let spans: { start: number; end: number; method: "exact" | "normalized" }[] = [];
  if (q) spans = allIndexes(region, q).map((i) => ({ start: lo + i, end: lo + i + q.length, method: "exact" as const }));
  if (!spans.length && q && options.allowNormalized !== false) {
    const nq = normalizeWithMap(q).text.trim();
    if (nq.length >= (options.minNormalizedLength ?? 15)) {
      const nr = normalizeWithMap(region);
      spans = allIndexes(nr.text, nq).map((i) => ({
        start: lo + nr.map[i],
        end: lo + nr.map[i + nq.length - 1] + 1,
        method: "normalized" as const,
      }));
    }
  }
  if (!spans.length) return { status: "not_found", anchors: [] };
  let chosen = spans;
  if (spans.length > 1 && (options.prefix || options.suffix)) {
    const scored = spans.map((s) => ({ s, score: contextScore(text, s.start, s.end, options.prefix, options.suffix) }));
    const max = Math.max(...scored.map((x) => x.score));
    chosen = scored.filter((x) => x.score === max).map((x) => x.s);
  }
  const anchors = chosen.map((s) =>
    makeAnchor(text, options.documentId, s.start, s.end, {
      contextChars: options.contextChars,
      sections: options.sections,
      matchMethod: s.method,
    }),
  );
  return { status: anchors.length === 1 ? "unique" : "ambiguous", anchors };
}

export type AnchorProblemCode =
  | "unknown_document"
  | "text_hash_mismatch"
  | "bad_range"
  | "out_of_range"
  | "exact_mismatch"
  | "prefix_mismatch"
  | "suffix_mismatch"
  | "section_mismatch";

export interface AnchorProblem {
  anchorId: string;
  code: AnchorProblemCode;
  message: string;
}

export interface ValidateAnchorsResult {
  valid: boolean;
  problems: AnchorProblem[];
}

/**
 * Check anchors against the document texts: the span is in range, `text.slice(start, end)`
 * equals `exact` (or equals it after the recorded normalization), and prefix/suffix agree.
 * With `documents`, also checks each text against its recorded `textSha256` and section ids.
 */
export function validateAnchors(
  anchors: Anchor[],
  texts: Record<string, string>,
  options: { documents?: GraphDocument[] } = {},
): ValidateAnchorsResult {
  const problems: AnchorProblem[] = [];
  const docs = new Map((options.documents ?? []).map((d) => [d.id, d]));
  const hashOk = new Map<string, boolean>();
  for (const a of anchors) {
    const add = (code: AnchorProblemCode, message: string) => problems.push({ anchorId: a.id, code, message });
    const text = texts[a.documentId];
    if (text === undefined) {
      add("unknown_document", `no text supplied for document ${a.documentId}`);
      continue;
    }
    const doc = docs.get(a.documentId);
    if (doc) {
      if (!hashOk.has(doc.id)) hashOk.set(doc.id, sha256(text) === doc.textSha256);
      if (!hashOk.get(doc.id)) {
        add("text_hash_mismatch", `supplied text for ${doc.id} does not match its textSha256`);
        continue;
      }
      if (a.sectionId !== undefined && !doc.sections.some((s) => s.id === a.sectionId && a.start >= s.start && a.start < s.end))
        add("section_mismatch", `anchor start ${a.start} is not inside section ${a.sectionId}`);
    }
    if (a.end < a.start) {
      add("bad_range", `end ${a.end} is before start ${a.start}`);
      continue;
    }
    if (a.end > text.length) {
      add("out_of_range", `end ${a.end} is beyond the text length ${text.length}`);
      continue;
    }
    const slice = text.slice(a.start, a.end);
    const same =
      a.matchMethod === "exact"
        ? slice === a.exact
        : normalizeWithMap(slice, a.normalization).text.trim() === normalizeWithMap(a.exact, a.normalization).text.trim();
    if (!same) add("exact_mismatch", "the span does not contain the anchor's exact text");
    if (a.prefix && !text.slice(0, a.start).endsWith(a.prefix)) add("prefix_mismatch", "prefix does not precede the span");
    if (a.suffix && !text.slice(a.end).startsWith(a.suffix)) add("suffix_mismatch", "suffix does not follow the span");
  }
  return { valid: problems.length === 0, problems };
}
