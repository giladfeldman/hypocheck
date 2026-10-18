/**
 * Rule-based analysis of free-text hypotheses (no AI).
 *
 * 1. findCandidates(): split a document into sentences and keep the ones that
 *    look like hypotheses — used to locate hypotheses before any AI call and as
 *    the AI-free fallback for the Extract page.
 * 2. specificityLevel(): the 0–3 ordinal of an earlier rule-based preregistration-analysis
 *    module, ported pattern-for-pattern: 0 none, 1 direction only, 2 direction + magnitude/threshold,
 *    3 direction + disconfirmation criteria.
 */

const HYPOTHESIS_MARKERS = [
  /\bhypothes[ie]s?\b/i,
  /\bpredict(ion|ed|s)?\b/i,
  /\bexpect(ed|ation|ing)?\b/i,
  /\banticipat(e|ed|ing)\b/i,
  /\bwe (hypothesi[sz]e|predict|expect|propose|anticipate)\b/i,
  /\bH\d+[a-z]?\s*[:.)]/,
];

const DIRECTION_PATTERNS = [
  /\b(positive(ly)?|negative(ly)?)\s+(relat|associat|correlat|predict)/i,
  /\b(higher|lower|greater|less|more|fewer|increase|decrease|improve|decline|reduce|enhance)\b/i,
  /\b(outperform|exceed|surpass)\b/i,
  /\bwill\s+(be\s+)?(higher|lower|greater|more|less)\b/i,
];

const MAGNITUDE_PATTERNS = [
  /\bd\s*[=><]\s*[\d.]/i,
  /\br\s*[=><]\s*[\d.]/i,
  /\bOR\s*[=><]\s*[\d.]/,
  /\b(Cohen'?s?\s+[dfrw]|eta.squared|partial.eta|omega.squared)\b/i,
  /\b(small|medium|large)\s+effect/i,
  /\b(at\s+least|minimum|no\s+less\s+than)\s+[\d.]/i,
  /\b\d+\s*%\s*(change|difference|improvement|increase|decrease)\b/i,
  /\beffect\s+size\s+of\s+[\d.]/i,
  /\bminimum\s+(detectable|meaningful|clinically)\b/i,
];

const DISCONFIRM_PATTERNS = [
  /\b(disconfirm|falsif|refut|reject)/i,
  /\b(conclude\s+no\s+effect|evidence\s+against|fail(ure)?\s+to\s+(support|find))\b/i,
  /\b(we\s+will\s+conclude|we\s+would\s+conclude)\b.*\bnot\b/i,
  /\b(inconclusive|ambiguous)\s+if\b/i,
  /\bconfirm(ed)?\s+if\b.*\bdisconfirm(ed)?\s+if\b/i,
  /\bsupport(ed)?\s+(if|when)\b.*\bnot\s+support(ed)?\s+(if|when)\b/i,
];

export type Specificity = {
  level: 0 | 1 | 2 | 3;
  hasHypothesis: boolean;
  hasDirection: boolean;
  hasMagnitude: boolean;
  hasDisconfirm: boolean;
};

const any = (ps: RegExp[], t: string) => ps.some((p) => p.test(t));

export function specificityLevel(text: string): Specificity {
  const hasHypothesis = any(HYPOTHESIS_MARKERS, text);
  const hasDirection = any(DIRECTION_PATTERNS, text);
  const hasMagnitude = any(MAGNITUDE_PATTERNS, text);
  const hasDisconfirm = any(DISCONFIRM_PATTERNS, text);
  let level: Specificity["level"] = 0;
  if (hasHypothesis) {
    if (hasDisconfirm && hasDirection) level = 3;
    else if (hasMagnitude && hasDirection) level = 2;
    else if (hasDirection) level = 1;
  }
  return { level, hasHypothesis, hasDirection, hasMagnitude, hasDisconfirm };
}

export const LEVEL_LABELS = [
  "No clear hypothesis",
  "Direction only",
  "Direction + magnitude or threshold",
  "Direction + criteria for disconfirmation",
] as const;

export type Candidate = {
  text: string;
  start: number;
  end: number;
  label?: string;
  /** The sentence plus the following sentences that elaborate it (findCandidates only). */
  context?: string;
};

// Tokens ending in "." that do not end a sentence in scientific prose.
const ABBREV = /(?:\b(?:e\.g|i\.e|cf|vs|al|etc|approx|ca|Fig|Figs|Tab|Eq|Eqs|No|Nos|Vol|pp|p|Dr|Prof|resp|incl|esp|Exp|Expt|Study|St)|\b[A-Z])$/;

/**
 * Split text into sentences with offsets into the original string. A sentence ends
 * at . ! ? followed by whitespace (not inside decimals like "d = 0.3" or after
 * abbreviations like "e.g."), at a blank line, or before a line that starts with a hypothesis label.
 */
const LINE_LABEL = /^\n[ \t]*(?:H\d+[a-z]?|Hypothesis\s+\d+[a-z]?)\s*[:.)]/i;

export function splitSentences(text: string): Candidate[] {
  const out: Candidate[] = [];
  let start = 0;
  const push = (end: number) => {
    const s = text.slice(start, end);
    const lead = s.length - s.trimStart().length;
    const t = s.trim();
    if (t) out.push({ text: t, start: start + lead, end: start + lead + t.length });
    start = end;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\n" && /^\n[ \t]*\n/.test(text.slice(i, i + 40))) {
      push(i);
      continue;
    }
    // A line that starts with a hypothesis label ("H2:", "Hypothesis 2:") starts a new sentence even
    // when the previous line lost its final period (PDF line wraps drop it).
    if (ch === "\n" && LINE_LABEL.test(text.slice(i, i + 40))) {
      push(i);
      continue;
    }
    if (ch !== "." && ch !== "!" && ch !== "?") continue;
    // include closing quotes/brackets
    let j = i + 1;
    while (j < text.length && /["”’')\]]/.test(text[j])) j++;
    if (j < text.length && !/\s/.test(text[j])) continue; // "0.3", "e.g.,", URLs
    if (ch === ".") {
      const before = text.slice(Math.max(start, i - 12), i);
      if (ABBREV.test(before)) continue;
    }
    push(j);
    i = j - 1;
  }
  push(text.length);
  return out;
}

/**
 * Split into sentences (keeping offsets into the original text) and keep those
 * with a hypothesis marker. Very long "sentences" (tables, run-ons) are skipped.
 */
export function findCandidates(text: string, max = 60): Candidate[] {
  const out: Candidate[] = [];
  const raw = splitSentences(text);
  const LABEL = /\bH\d+[a-z]?\s*[:.)]/;
  const sameParagraph = (a: Candidate, b: Candidate) => !/\n[ \t]*\n/.test(text.slice(a.end, b.start));
  const marked = raw.map((c) => {
    const flat = c.text.replace(/\s+/g, " ");
    return flat.length >= 25 && flat.length <= 700 && any(HYPOTHESIS_MARKERS, flat);
  });
  // An unlabelled marker sentence after a labelled hypothesis in the same paragraph that
  // states no direction of its own ("H1: … . We expect at least d = .25.") elaborates H1;
  // one with its own direction ("We also expect X will increase Y.") is a new prediction.
  const isCand: boolean[] = [];
  let underLabel = false;
  raw.forEach((c, k) => {
    if (k > 0 && !sameParagraph(raw[k - 1], c)) underLabel = false;
    if (!marked[k]) return void isCand.push(false);
    if (LABEL.test(c.text)) {
      underLabel = true;
      return void isCand.push(true);
    }
    if (underLabel && !any(DIRECTION_PATTERNS, c.text)) return void isCand.push(false);
    underLabel = false;
    isCand.push(true);
  });
  for (let k = 0; k < raw.length && out.length < max; k++) {
    if (!isCand[k]) continue;
    const c = raw[k];
    // Criteria for a hypothesis are often in the next sentences ("We expect d ≥ .25 … we will
    // conclude … if …"). Context = this sentence + up to 4 following non-candidate sentences
    // in the same paragraph.
    let end = c.end;
    for (let j = k + 1; j < raw.length && j <= k + 4 && !isCand[j]; j++) {
      if (/\n[ \t]*\n/.test(text.slice(end, raw[j].start))) break;
      end = raw[j].end;
    }
    const label = c.text.match(/\b(H\d+[a-z]?)\b/)?.[1];
    out.push({ ...c, label, context: text.slice(c.start, end) });
  }
  return out;
}

/** True if `quote` occurs in `source` after whitespace/hyphenation/quote-mark normalisation. */
export function quoteIsVerbatim(source: string, quote: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/-\s*\n\s*/g, "") // de-hyphenate line breaks
      .replace(/[“”«»„]/g, '"')
      .replace(/[‘’‚]/g, "'")
      .replace(/[‐‑‒–—]/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  const q = norm(quote);
  if (q.length < 15) return false;
  return norm(source).includes(q);
}
