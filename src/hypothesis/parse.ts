/**
 * Bounded, rule-based reading of a one-sentence prediction into its parts:
 * what varies (predictor), what is measured (outcome), the expected relationship,
 * an explicitly named comparison and an explicitly named population.
 *
 * Deliberately small (design review 2026-10-18): a fixed pattern set, no AI,
 * and three honest outcomes —
 *   - "parsed":      every part the sentence states was found, direction is explicit;
 *   - "ambiguous":   parts found, but one thing must be asked (direction not stated,
 *                    or a word like "better" / "improve" that could mean higher or lower);
 *   - "unsupported": no confident reading — the caller offers "choose the parts yourself".
 *
 * Rules that keep it honest:
 *   - direction only when explicit ("affects", "is related to" stay unspecified);
 *   - a comparison or population is reported only when the sentence names it;
 *   - every part carries the character span it came from (input.slice(start, end) === text);
 *   - negated, compound, moderation and question sentences are refused, not guessed.
 *
 * Pure module: no framework imports.
 */

export type ParseStatus = "parsed" | "ambiguous" | "unsupported";
export type Span = { start: number; end: number };
export type TextPart = { text: string; span: Span };
export type Direction = "positive" | "negative" | "nondirectional" | "equivalence" | "unspecified";
/** association = an id from vocab.ts ASSOCIATIONS ("" while the direction is undecided). */
export type RelationshipPart = TextPart & { direction: Direction; association: string };

export type ParseParts = {
  predictor?: TextPart;
  outcome?: TextPart;
  relationship?: RelationshipPart;
  comparison?: TextPart;
  population?: TextPart;
};

export type Alternative = { label: string; association: string; direction: Direction };
export type QuestionOption = { label: string; association: string | null };

export type UnsupportedReason = "empty" | "question" | "compound" | "negated" | "moderation" | "too_long" | "no_pattern";

export type ParseResult = {
  status: ParseStatus;
  input: string;
  /** Name of the pattern that matched, for tests and debugging. */
  pattern: string | null;
  parts: ParseParts;
  /** For "ambiguous": the readings the question chooses between. */
  alternatives: Alternative[];
  /** For "ambiguous": one concrete question; an option with association null means "choose yourself". */
  question?: { text: string; options: QuestionOption[] };
  reason?: UnsupportedReason;
  /** Non-blocking observations (e.g. hedged wording). */
  notes: string[];
};

// ── vocabulary ──────────────────────────────────────────────────────────────

const POS = ["higher", "greater", "more", "larger", "increased", "elevated", "stronger", "bigger", "longer"];
const NEG = ["lower", "less", "fewer", "smaller", "decreased", "reduced", "weaker", "shorter", "diminished"];
const AMB = ["better", "worse", "improved", "poorer", "impaired", "faster", "slower"];
const DIRW = [...POS, ...NEG, ...AMB].join("|");

const MOD = "(?:will|would|should|shall|may|might|can|could|is expected to|are expected to|tends? to)";
const BE = "(?:be|is|are|was|were)";
const HEDGES = /\b(may|might|could|can|possibly|perhaps|probably|likely|tends? to)\b/i;

const VERB_POS = ["increase", "increases", "increased", "raise", "raises", "raised", "boost", "boosts", "boosted", "enhance", "enhances", "enhanced"];
const VERB_NEG = ["decrease", "decreases", "decreased", "reduce", "reduces", "reduced", "lower", "lowers", "lowered", "diminish", "diminishes", "diminished"];
const VERB_AMB = ["improve", "improves", "improved", "impair", "impairs", "impaired", "worsen", "worsens", "worsened"];
const VERB_UNSPEC = ["affect", "affects", "affected", "influence", "influences", "influenced", "impact", "impacts", "predict", "predicts", "predicted", "change", "changes"];
const VERBS = [...VERB_POS, ...VERB_NEG, ...VERB_AMB, ...VERB_UNSPEC].join("|");

/** Verbs and markers that make a clause a prediction; two such clauses joined by "and" = compound. */
const RELATION_MARKER =
  /\b(?:increas|decreas|reduc|rais|boost|enhanc|improv|impair|worsen|diminish|affect|influenc|impact|predict|associat|correlat|linked|differ|lead|result|caus)\w*|\brelat(?:ed|es)\b/i;

const MAX_WORDS = 12;
const PRONOUN_HEADS = /^(those|they|anyone|someone|whoever|ones|people)$/i;

type Sign = 1 | -1 | 0; // 0 = ambiguous word ("better")

function wordSign(w: string | undefined): Sign | null {
  if (!w) return null;
  const s = w.toLowerCase();
  if (POS.includes(s)) return 1;
  if (NEG.includes(s)) return -1;
  if (AMB.includes(s)) return 0;
  return null;
}

function verbSign(v: string): Sign | null {
  const s = v.toLowerCase();
  if (VERB_POS.includes(s)) return 1;
  if (VERB_NEG.includes(s)) return -1;
  if (VERB_AMB.includes(s)) return 0;
  return null; // unspecified ("affects")
}

// ── span helpers ────────────────────────────────────────────────────────────

type Region = { text: string; offset: number };

/** Locate each captured group in order; returns absolute spans (undefined for missing groups). */
function groupSpans(m: RegExpExecArray, region: Region): (TextPart | undefined)[] {
  const out: (TextPart | undefined)[] = [];
  let cursor = m.index;
  for (let i = 1; i < m.length; i++) {
    const g = m[i];
    if (g === undefined) {
      out.push(undefined);
      continue;
    }
    const at = region.text.indexOf(g, cursor);
    const start = at < 0 ? cursor : at;
    out.push({ text: g, span: { start: region.offset + start, end: region.offset + start + g.length } });
    if (at >= 0) cursor = at + g.length;
  }
  return out;
}

const LEAD_DET = /^(?:the|a|an|their|his|her|its|our|your)\s+/i;
const TRAIL_PUNCT = /[\s,;:.!]+$/;

/** Trim determiners and trailing punctuation, keeping the span exact. */
function clean(p: TextPart | undefined): TextPart | undefined {
  if (!p) return undefined;
  let { text } = p;
  let { start, end } = p.span;
  const lead = text.match(/^\s+/);
  if (lead) {
    text = text.slice(lead[0].length);
    start += lead[0].length;
  }
  const det = text.match(LEAD_DET);
  if (det && text.length > det[0].length) {
    text = text.slice(det[0].length);
    start += det[0].length;
  }
  const trail = text.match(TRAIL_PUNCT);
  if (trail) {
    text = text.slice(0, text.length - trail[0].length);
    end -= trail[0].length;
  }
  if (!text) return undefined;
  return { text, span: { start, end } };
}

function between(input: string, a: TextPart | undefined, b: TextPart | undefined): TextPart | undefined {
  if (!a || !b) return undefined;
  const [first, second] = a.span.start <= b.span.start ? [a, b] : [b, a];
  const raw = input.slice(first.span.end, second.span.start);
  const lead = raw.length - raw.trimStart().length;
  const text = raw.trim();
  if (!text) return undefined;
  const start = first.span.end + lead;
  return { text, span: { start, end: start + text.length } };
}

function words(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

// ── result builders ─────────────────────────────────────────────────────────

function unsupported(input: string, reason: UnsupportedReason, notes: string[] = []): ParseResult {
  return { status: "unsupported", input, pattern: null, parts: {}, alternatives: [], reason, notes };
}

const ASSOC_FOR_SIGN = (s: 1 | -1) => (s === 1 ? "increased" : "decreased");

type Raw = {
  pattern: string;
  predictor?: TextPart;
  outcome?: TextPart;
  comparison?: TextPart;
  population?: TextPart;
  /** Sign of a leading comparative on the predictor ("Lower self-control …"); 1 when absent. */
  predictorSign: Sign;
  /** Direction on the outcome side; null = not stated. */
  outcomeSign: Sign | null;
  /** Explicit class that bypasses signs. */
  fixed?: "nondirectional" | "equivalence";
  /** The word that made the direction ambiguous, for the question. */
  ambiguousWord?: string;
};

function finish(input: string, raw: Raw, notes: string[]): ParseResult {
  const predictor = clean(raw.predictor);
  const outcome = clean(raw.outcome);
  const comparison = clean(raw.comparison);
  const population = clean(raw.population);
  if (!predictor || !outcome) return unsupported(input, "no_pattern", notes);
  for (const p of [predictor, outcome, comparison, population]) if (p && words(p.text) > MAX_WORDS) return unsupported(input, "too_long", notes);

  let direction: Direction;
  let association = "";
  if (raw.fixed === "nondirectional") {
    direction = "nondirectional";
    association = "different";
  } else if (raw.fixed === "equivalence") {
    direction = "equivalence";
    association = "same_as";
  } else if (raw.outcomeSign === null) {
    direction = "unspecified";
  } else if (raw.outcomeSign === 0 || raw.predictorSign === 0) {
    direction = "unspecified";
  } else {
    const s = (raw.outcomeSign * raw.predictorSign) as 1 | -1;
    direction = s === 1 ? "positive" : "negative";
    association = ASSOC_FOR_SIGN(s);
  }

  const relSpan = between(input, predictor, outcome);
  const relationship: RelationshipPart = {
    text: relSpan?.text ?? "",
    span: relSpan?.span ?? { start: predictor.span.end, end: predictor.span.end },
    direction,
    association,
  };

  const parts: ParseParts = { predictor, outcome, relationship };
  if (comparison) parts.comparison = comparison;
  if (population) parts.population = population;

  if (direction !== "unspecified") {
    return { status: "parsed", input, pattern: raw.pattern, parts, alternatives: [], notes };
  }

  // One concrete question. Signs are relative to the predictor as worded.
  const ps: 1 | -1 = raw.predictorSign === -1 ? -1 : 1;
  const up = ASSOC_FOR_SIGN(ps);
  const down = ASSOC_FOR_SIGN((ps * -1) as 1 | -1);
  const amb = raw.ambiguousWord;
  if (amb) {
    return {
      status: "ambiguous",
      input,
      pattern: raw.pattern,
      parts,
      alternatives: [
        { label: `Higher values of ${outcome.text}`, association: up, direction: ps === 1 ? "positive" : "negative" },
        { label: `Lower values of ${outcome.text}`, association: down, direction: ps === 1 ? "negative" : "positive" },
      ],
      question: {
        text: `Does “${amb}” mean higher or lower values of ${outcome.text}?`,
        options: [
          { label: "Higher values", association: up },
          { label: "Lower values (e.g. fewer errors, shorter times)", association: down },
          { label: "Something else", association: null },
        ],
      },
      notes,
    };
  }
  return {
    status: "ambiguous",
    input,
    pattern: raw.pattern,
    parts,
    alternatives: [
      { label: `Higher ${outcome.text}`, association: up, direction: ps === 1 ? "positive" : "negative" },
      { label: `Lower ${outcome.text}`, association: down, direction: ps === 1 ? "negative" : "positive" },
      { label: "A difference, direction not predicted", association: "different", direction: "nondirectional" },
    ],
    question: {
      text: `Which way do you expect ${outcome.text} to go?`,
      options: [
        { label: `Higher ${outcome.text}`, association: up },
        { label: `Lower ${outcome.text}`, association: down },
        { label: "Different, but I don't predict which way", association: "different" },
      ],
    },
    notes,
  };
}

/** Split "Y than Z" inside a captured outcome into outcome + comparison. */
function splitThan(outcome: TextPart | undefined): { outcome?: TextPart; comparison?: TextPart } {
  if (!outcome) return {};
  const m = outcome.text.match(/\s+than\s+/i);
  if (!m || m.index === undefined) return { outcome };
  const o = outcome.text.slice(0, m.index);
  const cStart = m.index + m[0].length;
  const c = outcome.text.slice(cStart);
  return {
    outcome: { text: o, span: { start: outcome.span.start, end: outcome.span.start + o.length } },
    comparison: c ? { text: c, span: { start: outcome.span.start + cStart, end: outcome.span.end } } : undefined,
  };
}

/** "Students who sleep longer" → population "Students", predictor "sleep longer". */
function splitWho(subject: TextPart | undefined): { predictor?: TextPart; population?: TextPart } {
  if (!subject) return {};
  const m = subject.text.match(/^([A-Za-z][\w-]*(?:\s+[A-Za-z][\w-]*)?)\s+(?:who|that|with)\s+/i);
  if (!m) return { predictor: subject };
  const head = m[1];
  const rest = subject.text.slice(m[0].length);
  const restStart = subject.span.start + m[0].length;
  const predictor = { text: rest, span: { start: restStart, end: subject.span.end } };
  if (PRONOUN_HEADS.test(head)) return { predictor };
  return { predictor, population: { text: head, span: { start: subject.span.start, end: subject.span.start + head.length } } };
}

// ── patterns ────────────────────────────────────────────────────────────────

type Matcher = (r: Region) => Raw | null;

const re = (src: string) => new RegExp(src, "i");

const P_NODIFF = re(`^there\\s+(?:will\\s+be|is|are|would\\s+be)\\s+no\\s+(?:meaningful\\s+|significant\\s+)?difference\\s+in\\s+(.+?)\\s+between\\s+(.+?)\\s+and\\s+(.+)$`);
const P_DIFFER_AND = re(`^(.+?)\\s+and\\s+(.+?)\\s+(?:${MOD}\\s+)?(not\\s+)?differ\\s+(?:in|on|with respect to)\\s+(.+)$`);
const P_DIFFER_FROM = re(`^(.+?)\\s+(?:${MOD}\\s+)?(not\\s+)?differ\\s+from\\s+(.+?)\\s+(?:in|on|with respect to)\\s+(.+)$`);
const P_THERE = re(
  `^there\\s+(?:will\\s+be|is|are|would\\s+be)\\s+(?:an?\\s+)?(?:(positive|negative)\\s+)?(?:linear\\s+)?(?:relationship|correlation|association|link)\\s+between\\s+(.+?)\\s+and\\s+(.+)$`,
);
const P_MORE_THE = re(`^the\\s+(more|less|higher|lower|greater|fewer)\\s+(.+?),\\s*the\\s+(${DIRW})\\s+(.+)$`);
const P_ASSOC = re(
  `^(?:(${DIRW})\\s+)?(.+?)\\s+(?:${MOD}\\s+)?(?:${BE}\\s+)?(?:(positively|negatively)\\s+)?(?:associated|correlated|related|linked)\\s+(?:with|to)\\s+(?:(${DIRW})\\s+)?(.+)$`,
);
const P_BE_DIR = re(
  `^(.+?)\\s+(?:${MOD}\\s+)?${BE}\\s+(?:(?:significantly|substantially|much|slightly)\\s+)?(${DIRW})\\s+(?:in|among|for|when|during|after|under)\\s+(.+?)(?:\\s+than\\s+(?:(?:in|among|for|when|during|after|under)\\s+)?(.+))?$`,
);
const P_HAVE = re(
  `^(.+?)\\s+(?:${MOD}\\s+)?(?:have|has|show|shows|report|reports|display|displays|exhibit|exhibits|score|scores|make|makes|experience|experiences|produce|produces|get|gets|achieve|achieves)\\s+(?:(?:significantly|substantially|much|slightly)\\s+)?(${DIRW})\\s+(?:(?:on|in)\\s+)?(.+?)(?:\\s+than\\s+(.+))?$`,
);
const P_LEAD = re(
  `^(?:(${DIRW})\\s+)?(.+?)\\s+(?:${MOD}\\s+)?(?:lead|leads|led|result|results|resulted|cause|causes|caused)\\s+(?:to\\s+|in\\s+)?(?:(${DIRW})\\s+)?(.+)$`,
);
const P_VERB = re(`^(?:(${DIRW})\\s+)?(.+?)\\s+(?:${MOD}\\s+)?(?:(positively|negatively)\\s+)?(${VERBS})\\s+(?:(${DIRW})\\s+)?(.+)$`);

const MATCHERS_EQUIV: Matcher[] = [
  (r) => {
    const m = P_NODIFF.exec(r.text);
    if (!m) return null;
    const [outcome, predictor, comparison] = groupSpans(m, r);
    return { pattern: "no_difference_between", predictor, outcome, comparison, predictorSign: 1, outcomeSign: null, fixed: "equivalence" };
  },
  (r) => {
    const m = P_DIFFER_AND.exec(r.text);
    if (!m) return null;
    const [predictor, comparison, not, outcome] = groupSpans(m, r);
    return { pattern: "x_and_z_differ_in_y", predictor, comparison, outcome, predictorSign: 1, outcomeSign: null, fixed: not ? "equivalence" : "nondirectional" };
  },
  (r) => {
    const m = P_DIFFER_FROM.exec(r.text);
    if (!m) return null;
    const [predictor, not, comparison, outcome] = groupSpans(m, r);
    return { pattern: "x_differs_from_z_in_y", predictor, comparison, outcome, predictorSign: 1, outcomeSign: null, fixed: not ? "equivalence" : "nondirectional" };
  },
];

const MATCHERS: Matcher[] = [
  (r) => {
    const m = P_THERE.exec(r.text);
    if (!m) return null;
    const [sign, predictor, outcome] = groupSpans(m, r);
    const s = sign ? (sign.text.toLowerCase() === "positive" ? 1 : -1) : null;
    return { pattern: "there_is_a_relationship_between", predictor, outcome, predictorSign: 1, outcomeSign: s };
  },
  (r) => {
    const m = P_MORE_THE.exec(r.text);
    if (!m) return null;
    const [w1, predictor, w2, outcome] = groupSpans(m, r);
    const s1 = wordSign(w1?.text);
    const s2 = wordSign(w2?.text);
    return {
      pattern: "the_more_the_higher",
      predictor,
      outcome,
      predictorSign: s1 ?? 1,
      outcomeSign: s2,
      ambiguousWord: s2 === 0 ? w2?.text : undefined,
    };
  },
  (r) => {
    const m = P_ASSOC.exec(r.text);
    if (!m) return null;
    const [w1, predictor, adverb, w2, outcomeRaw] = groupSpans(m, r);
    const { outcome, comparison } = splitThan(outcomeRaw);
    const s1 = wordSign(w1?.text);
    let s2: Sign | null = wordSign(w2?.text);
    if (adverb) s2 = adverb.text.toLowerCase() === "positively" ? 1 : -1;
    const ambiguousWord = s1 === 0 ? w1?.text : s2 === 0 ? w2?.text : undefined;
    return { pattern: "x_associated_with_y", predictor, outcome, comparison, predictorSign: s1 ?? 1, outcomeSign: s2, ambiguousWord };
  },
  (r) => {
    const m = P_BE_DIR.exec(r.text);
    if (!m) return null;
    const [outcome, w, predictor, comparison] = groupSpans(m, r);
    const s = wordSign(w?.text);
    return { pattern: "y_higher_in_x", predictor, outcome, comparison, predictorSign: 1, outcomeSign: s, ambiguousWord: s === 0 ? w?.text : undefined };
  },
  (r) => {
    const m = P_HAVE.exec(r.text);
    if (!m) return null;
    const [subject, w, outcome, comparison] = groupSpans(m, r);
    const { predictor, population } = splitWho(subject);
    const s = wordSign(w?.text);
    return { pattern: "x_have_higher_y", predictor, population, outcome, comparison, predictorSign: 1, outcomeSign: s, ambiguousWord: s === 0 ? w?.text : undefined };
  },
  (r) => {
    const m = P_LEAD.exec(r.text);
    if (!m) return null;
    const [w1, predictor, w2, outcomeRaw] = groupSpans(m, r);
    const { outcome, comparison } = splitThan(outcomeRaw);
    const s1 = wordSign(w1?.text);
    const s2 = wordSign(w2?.text);
    const ambiguousWord = s1 === 0 ? w1?.text : s2 === 0 ? w2?.text : undefined;
    return { pattern: "x_leads_to_y", predictor, outcome, comparison, predictorSign: s1 ?? 1, outcomeSign: s2, ambiguousWord };
  },
  (r) => {
    const m = P_VERB.exec(r.text);
    if (!m) return null;
    const [w1, predictor, adverb, verb, w2, outcomeRaw] = groupSpans(m, r);
    const { outcome, comparison } = splitThan(outcomeRaw);
    const s1 = wordSign(w1?.text);
    let s2 = verb ? verbSign(verb.text) : null;
    // "predicts lower performance": an unspecified verb takes the direction word that follows it.
    let ambVerb = s2 === 0 ? verb?.text : undefined;
    if (s2 === null && w2) {
      s2 = wordSign(w2.text);
      if (s2 === 0) ambVerb = w2.text;
    }
    if (adverb) s2 = adverb.text.toLowerCase() === "positively" ? 1 : -1;
    const ambiguousWord = s1 === 0 ? w1?.text : s2 === 0 ? ambVerb : undefined;
    return { pattern: "x_verbs_y", predictor, outcome, comparison, predictorSign: s1 ?? 1, outcomeSign: s2, ambiguousWord };
  },
];

// ── entry point ─────────────────────────────────────────────────────────────

const PREFIX =
  /^\s*(?:(?:H|Hypothesis)\s*\d+[a-z]?\s*[:.)-]\s*)?(?:(?:we|i)\s+(?:hypothesi[sz]e|predict|expect|anticipate|propose)\s+(?:that\s+)?|it\s+is\s+(?:hypothesi[sz]ed|predicted|expected)\s+that\s+)?/i;
const POPULATION_PREFIX = /^(?:among|for|in)\s+([^,]{2,80}),\s*/i;
const COMPARISON_TAIL = /\s*,?\s+(?:compared\s+(?:to|with)|relative\s+to|versus|vs\.?)\s+(.+)$/i;
const MODERATION = /^(?:the\s+)?(?:effect|relationship|association|link|correlation|impact|influence)\s+(?:of|between)\b|\bmoderat\w*|\binteract\w*/i;
const NEGATION = /\b(?:not|never|cannot)\b|n't\b/i;

function isCompound(core: string): boolean {
  const segments = core.split(/\s+(?:and|but|while|whereas)\s+/i);
  if (segments.length < 2) return false;
  const withRelation = segments.filter((s) => RELATION_MARKER.test(s)).length;
  if (withRelation >= 2) return true;
  // "… higher exam scores and lower anxiety": a later segment opening with its own direction word.
  return segments.slice(1).some((s) => new RegExp(`^(?:${DIRW})\\b`, "i").test(s.trim()));
}

export function parseHypothesisSentence(input: string): ParseResult {
  const text = input ?? "";
  if (!text.trim()) return unsupported(text, "empty");
  if (text.trim().endsWith("?")) return unsupported(text, "question");

  const notes: string[] = [];
  const hedge = text.match(HEDGES);
  if (hedge) notes.push(`Hedged wording (“${hedge[0]}”): a prediction is easier to test when it is stated definitely.`);

  // Core region: strip a trailing full stop, a "We predict that" / "H1:" prefix.
  let end = text.length;
  const trail = text.match(/[\s.!]+$/);
  if (trail) end -= trail[0].length;
  const prefix = text.slice(0, end).match(PREFIX);
  let start = prefix ? prefix[0].length : 0;

  let population: TextPart | undefined;
  const popM = text.slice(start, end).match(POPULATION_PREFIX);
  if (popM) {
    const at = start + popM[0].indexOf(popM[1]);
    population = { text: popM[1], span: { start: at, end: at + popM[1].length } };
    start += popM[0].length;
  }

  let comparison: TextPart | undefined;
  const cmpM = COMPARISON_TAIL.exec(text.slice(start, end));
  if (cmpM && cmpM.index !== undefined) {
    const at = start + cmpM.index + cmpM[0].lastIndexOf(cmpM[1]);
    comparison = { text: cmpM[1], span: { start: at, end: at + cmpM[1].length } };
    end = start + cmpM.index;
  }

  const region: Region = { text: text.slice(start, end), offset: start };
  if (!region.text.trim()) return unsupported(text, "no_pattern", notes);
  if (/^if\b/i.test(region.text)) return unsupported(text, "no_pattern", notes);
  if (isCompound(region.text)) return unsupported(text, "compound", notes);

  const withShared = (raw: Raw): Raw => ({
    ...raw,
    population: raw.population ?? population,
    comparison: raw.comparison ?? comparison,
  });

  for (const m of MATCHERS_EQUIV) {
    const raw = m(region);
    if (raw) return finish(text, withShared(raw), notes);
  }
  if (MODERATION.test(region.text)) return unsupported(text, "moderation", notes);
  if (NEGATION.test(region.text)) return unsupported(text, "negated", notes);
  for (const m of MATCHERS) {
    const raw = m(region);
    if (raw) return finish(text, withShared(raw), notes);
  }
  return unsupported(text, "no_pattern", notes);
}

/** Plain-language message for an unsupported reason (UI copy; kept here so it travels with the parser). */
export const UNSUPPORTED_MESSAGE: Record<UnsupportedReason, string> = {
  empty: "Write what you expect to find first.",
  question: "This reads as a question. Turn it into a prediction with the scaffold, or choose the parts yourself.",
  compound: "This looks like more than one prediction. Write one at a time, or choose the parts of the first yourself.",
  negated: "Predictions worded with “not” are hard to read reliably. Choose the parts yourself.",
  moderation: "This prediction seems to depend on another variable. Choose the parts yourself, then use “Does this depend on another variable?”.",
  too_long: "Some parts are too long to separate confidently. Choose the parts yourself.",
  no_pattern: "I couldn’t confidently separate this prediction. Your wording is safe. Choose its parts, or keep editing.",
};
