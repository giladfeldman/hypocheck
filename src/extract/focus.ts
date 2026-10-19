/**
 * What part of a long document the AI reads.
 *
 * Free models have small per-minute token limits (measured 2026-10-19: Groq's gpt-oss-120b
 * refused a 30,000-character extraction prompt at 8,825 of 8,000 tokens per minute), so a
 * long paper cannot be sent whole. Sending only its first N characters missed every
 * hypothesis stated after the introduction. Instead:
 *   1. stripReferences() removes the reference list (it is never a source of hypotheses, and
 *      its titles — "Prediction of response to …" — look like hypothesis sentences to the rules);
 *   2. focusDocument() keeps the opening (abstract), each passage with hypothesis language and
 *      each section headed "Hypotheses", "The present research", "Predictions" …, in document
 *      order with "[…]" between passages, up to a character budget.
 * Every kept passage is an exact slice of the input, so a quote the model copies from it is
 * still found verbatim in the full text.
 */
import { findCandidates, splitSentences } from "../quality/freetext.js";

/** A line that is only a reference-list heading. */
const REFERENCES_HEADING = /^[ \t]*(?:\d+\.?\s+)?(?:references?(?: list| cited)?|bibliography|literature cited|works cited|cited literature)[ \t]*:?[ \t]*$/gim;
/** A heading that ends the reference list: material after it is kept. */
const AFTER_REFERENCES = /^[ \t]*(?:appendix|appendices|supplementa(?:l|ry)(?: material| materials| information)?|online supplement)\b[^\n]{0,80}$/im;

export type StrippedReferences = {
  text: string;
  /** Characters removed; 0 when no reference list was found. */
  removedChars: number;
};

/**
 * Remove every reference-list section whose heading line sits in the second half of the document
 * (the paper's own list and a supplement's list), each up to the next appendix/supplement heading
 * or the end. A "References" heading in the first half (a table of contents, a preregistration
 * template field) is left alone.
 */
export function stripReferences(text: string): StrippedReferences {
  const sections: { start: number; end: number }[] = [];
  REFERENCES_HEADING.lastIndex = 0;
  for (let m = REFERENCES_HEADING.exec(text); m; m = REFERENCES_HEADING.exec(text)) {
    if (m.index < text.length * 0.5) continue;
    const bodyStart = m.index + m[0].length;
    const after = AFTER_REFERENCES.exec(text.slice(bodyStart));
    const end = after ? bodyStart + after.index : text.length;
    const prev = sections[sections.length - 1];
    if (prev && m.index < prev.end) continue; // a heading inside a section already removed
    sections.push({ start: m.index, end });
  }
  if (!sections.length) return { text, removedChars: 0 };
  let out = "";
  let at = 0;
  for (const s of sections) {
    out += text.slice(at, s.start);
    at = s.end;
  }
  out += text.slice(at);
  return { text: out, removedChars: text.length - out.length };
}

/** Section headings under which papers state their hypotheses. */
const HYPOTHESIS_HEADING =
  /^[ \t]*(?:\d+(?:\.\d+)*\.?\s+)?(?:(?:the\s+)?(?:present|current)\s+(?:research|study|studies|investigation|experiment)|(?:research\s+)?hypothes[ie]s|predictions?|(?:the\s+)?aims?(?:\s+and\s+hypothes[ie]s)?|research\s+questions?|(?:study\s+)?overview|preregistration|pre-registration)\b[^\n]{0,60}$/gim;

/** The first Method section heading (ends the introduction). */
const METHOD_HEADING = /^[ \t]*(?:\d+(?:\.\d+)*\.?\s+)?(?:method|methods|methodology|materials\s+and\s+methods|study\s+1|experiment\s+1)[ \t]*$/gim;

export type FocusedDocument = {
  /** The text the AI reads: the whole (reference-stripped) text, or passages joined by "\n[…]\n". */
  text: string;
  /** true when the whole document (minus its reference list) fits the budget. */
  complete: boolean;
  /** Characters of the original document inside the kept passages. */
  includedChars: number;
  /** Characters of the document after the reference list was removed. */
  totalChars: number;
  /** Number of passages kept (1 when complete). */
  passages: number;
  /** Characters of reference list removed. */
  referencesRemovedChars: number;
};

export const FOCUS_GAP = "\n[…]\n";
/** Longest single passage kept around one hypothesis sentence or heading. */
const MAX_PASSAGE = 4000;

type Range = { start: number; end: number; priority: number };

/**
 * Keep what a hypothesis extractor needs from a long document within `budgetChars`.
 * Priorities (lower = kept first): the opening/abstract, labelled hypotheses (H1:, Hypothesis 2),
 * hypothesis sections, then other hypothesis-language sentences in document order.
 */
export function focusDocument(document: string, budgetChars: number): FocusedDocument {
  const { text, removedChars } = stripReferences(document);
  if (text.length <= budgetChars) {
    return { text, complete: true, includedChars: text.length, totalChars: text.length, passages: 1, referencesRemovedChars: removedChars };
  }
  const sentences = splitSentences(text);
  const sentenceAt = (pos: number) => {
    let lo = 0;
    let hi = sentences.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (sentences[mid].start <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  /**
   * Widen [start, end) to whole sentences, `before` sentences earlier and `after` later — but never
   * past MAX_PASSAGE characters: text without sentence breaks (tables, a PDF that lost its
   * punctuation) would otherwise turn one passage into the whole document.
   */
  const widen = (start: number, end: number, before: number, after: number) => {
    if (!sentences.length) return { start, end };
    const a = Math.max(0, sentenceAt(start) - before);
    const b = Math.min(sentences.length - 1, sentenceAt(Math.max(start, end - 1)) + after);
    const s = Math.max(sentences[a].start, start - MAX_PASSAGE / 4);
    return { start: s, end: Math.min(sentences[b].end, s + MAX_PASSAGE, text.length) };
  };

  const ranges: Range[] = [];
  // 1. The opening: title, abstract, the start of the introduction (cut at a space, not widened).
  const openingCut = Math.min(2500, Math.floor(budgetChars * 0.15));
  const space = text.lastIndexOf(" ", openingCut);
  ranges.push({ start: 0, end: space > openingCut / 2 ? space : openingCut, priority: 0 });
  // 2. Hypothesis sections: the heading and what follows it.
  HYPOTHESIS_HEADING.lastIndex = 0;
  for (let m = HYPOTHESIS_HEADING.exec(text); m; m = HYPOTHESIS_HEADING.exec(text)) {
    ranges.push({ ...widen(m.index, Math.min(text.length, m.index + 1500), 0, 0), priority: 2 });
  }
  // 3. Hypothesis-language sentences with the sentence before and their elaboration after.
  for (const c of findCandidates(text, 80)) {
    const end = c.start + (c.context?.length ?? c.text.length);
    ranges.push({ ...widen(c.start, end, 1, 1), priority: c.label ? 1 : 3 });
  }
  // 4. The end of the introduction (just before the first Method heading), where papers state
  //    their aims; then, with budget left over, the rest of the introduction in order.
  METHOD_HEADING.lastIndex = 0;
  const method = METHOD_HEADING.exec(text);
  const introEnd = method && method.index > openingCut ? method.index : Math.min(text.length, Math.floor(text.length * 0.4));
  ranges.push({ ...widen(Math.max(openingCut, introEnd - 3000), introEnd, 0, 0), priority: 2 });
  for (let at = openingCut; at < introEnd; at += 2000) ranges.push({ ...widen(at, Math.min(introEnd, at + 2000), 0, 0), priority: 4 });

  // Take ranges by priority (document order within a priority) until the budget is used.
  ranges.sort((x, y) => x.priority - y.priority || x.start - y.start);
  // Merge overlapping or touching ranges, in document order.
  const mergeRanges = (list: { start: number; end: number }[]) => {
    const sorted = [...list].sort((x, y) => x.start - y.start);
    const out: { start: number; end: number }[] = [];
    for (const k of sorted) {
      const prev = out[out.length - 1];
      if (prev && k.start <= prev.end + 2) prev.end = Math.max(prev.end, k.end);
      else out.push({ start: k.start, end: k.end });
    }
    return out;
  };
  // The exact size of what would be sent: merged passages plus one gap marker between them.
  const sizeOf = (list: { start: number; end: number }[]) =>
    list.reduce((n, r) => n + (r.end - r.start), 0) + FOCUS_GAP.length * Math.max(0, list.length - 1);
  let merged: { start: number; end: number }[] = [];
  for (const r of ranges) {
    const next = mergeRanges([...merged, { start: r.start, end: r.end }]);
    if (sizeOf(next) > budgetChars) continue;
    merged = next;
  }
  // Nothing fitted (a budget smaller than any passage): fall back to the start of the text.
  if (!merged.length) merged.push({ start: 0, end: Math.min(text.length, budgetChars) });
  const parts = merged.map((r) => text.slice(r.start, r.end));
  return {
    text: parts.join(FOCUS_GAP),
    complete: false,
    includedChars: parts.reduce((n, p) => n + p.length, 0),
    totalChars: text.length,
    passages: parts.length,
    referencesRemovedChars: removedChars,
  };
}
