/**
 * Deterministic text scanners used by the published-paper rules. Pure functions of the text
 * (and section ranges); no model is involved. Every match carries exact UTF-16 offsets.
 *
 * These are detectors of wording, not judges of science: a match is a premise a rule may use,
 * and every pattern has hard-negative tests (tests/textscan.test.ts).
 */
import { splitSentences } from "../quality/freetext.js";
import type { CanonicalSection, Section } from "./graph.js";

export interface TextMatch {
  start: number;
  end: number;
  exact: string;
  /** Which pattern matched (stable id, listed in the README). */
  pattern: string;
}

export interface SentenceSpan {
  start: number;
  end: number;
  text: string;
}

/** Map a section heading to a canonical class. */
export function canonicalSection(label: string): CanonicalSection {
  const s = label.trim().toLowerCase().replace(/^[\d.\s]+/, "");
  if (/^abstract\b|^summary$/.test(s)) return "abstract";
  if (/hypothes[ie]s|predictions?\b|the present (study|research)|current (study|research)/.test(s)) return "hypotheses";
  if (/^(references|bibliography|works cited|literature cited)\b/.test(s)) return "references";
  if (/^(general\s+)?discussion\b|^conclusions?\b|^limitations\b/.test(s)) return "discussion";
  if (/^results?\b|^findings\b|confirmatory analys|exploratory analys|^analys[ie]s\b/.test(s)) return "results";
  if (/^(methods?|methodology|participants|procedure|materials|design|measures|sample|power analysis|data analysis)\b/.test(s)) return "methods";
  if (/^(introduction|background|theoretical background|literature review)\b/.test(s)) return "introduction";
  return "other";
}

/** The canonical class of a section: its `canonicalLabel`, else derived from its heading. */
export function sectionClass(section: Section): CanonicalSection {
  return section.canonicalLabel ?? canonicalSection(section.label);
}

/**
 * Ranges of `text` to scan for a set of section classes. With no classified sections the whole
 * text is one range and `sectionsKnown` is false (callers decide whether that is acceptable).
 */
export function rangesFor(
  text: string,
  sections: Section[] | undefined,
  classes: CanonicalSection[],
): { ranges: { start: number; end: number; sectionId?: string }[]; sectionsKnown: boolean } {
  const classified = (sections ?? []).filter((s) => sectionClass(s) !== "other");
  if (!classified.length) return { ranges: [{ start: 0, end: text.length }], sectionsKnown: false };
  return {
    ranges: (sections ?? [])
      .filter((s) => classes.includes(sectionClass(s)))
      .map((s) => ({ start: s.start, end: Math.min(s.end, text.length), sectionId: s.id })),
    sectionsKnown: true,
  };
}

/** Sentences (with document offsets) inside the given ranges. */
export function sentencesIn(text: string, ranges: { start: number; end: number }[]): SentenceSpan[] {
  const out: SentenceSpan[] = [];
  for (const r of ranges) {
    for (const s of splitSentences(text.slice(r.start, r.end))) {
      out.push({ start: r.start + s.start, end: r.start + s.end, text: s.text });
    }
  }
  return out;
}

function scan(text: string, patterns: [string, RegExp][], offset = 0): TextMatch[] {
  const out: TextMatch[] = [];
  for (const [id, re] of patterns) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    for (const m of text.matchAll(g)) {
      if (m.index === undefined) continue;
      out.push({ start: offset + m.index, end: offset + m.index + m[0].length, exact: m[0], pattern: id });
    }
  }
  return out.sort((a, b) => a.start - b.start || b.end - a.end);
}

// ───────────────────────── trend language (R5) ─────────────────────────

export const TREND_PATTERNS: [string, RegExp][] = [
  ["marginal_significance", /\bmarginal(?:ly)?[\s-]+(?:statistically[\s-]+)?significan\w*/i],
  ["approached_significance", /\bapproach(?:ed|es|ing)?\s+(?:statistical\s+|conventional\s+(?:levels\s+of\s+)?)?significance\b/i],
  ["trend_toward_significance", /\btrend(?:ed|ing|s)?\s+towards?\s+(?:statistical\s+)?significan\w*/i],
  ["borderline_significance", /\b(?:borderline|near(?:ly)?)[\s-]+significan\w*/i],
  ["trend_level", /\btrend[\s-]+level\b/i],
  ["trend_toward_effect", /\b(?:a|the)\s+(?:non-?significant\s+|weak\s+|slight\s+)?trend\s+(?:towards?|for)\s+(?:a|an|the|higher|lower|more|less|greater|smaller|larger|increased|decreased|better|worse)\b/i],
  ["short_of_significance", /\b(?:fell|falls|falling)\s+(?:just\s+)?short\s+of\s+(?:statistical\s+)?significance\b/i],
  ["not_quite_significant", /\bdid\s+not\s+quite\s+reach\s+(?:statistical\s+)?significance\b/i],
];

/** "Marginally significant", "a trend toward significance" and similar wording. Not "linear trend". */
export function findTrendLanguage(text: string): TextMatch[] {
  return scan(text, TREND_PATTERNS);
}

const SUPPORT_RE =
  /\b(?:support(?:s|ed|ing)?|confirm(?:s|ed|ing)?|corroborat\w*|consistent\s+with|in\s+line\s+with|as\s+(?:predicted|hypothesi[sz]ed|expected))\b/gi;
const NEGATION_RE = /\b(?:not|no|never|nor|neither|cannot|without|n't)\b|n't\b/i;

/**
 * Support wording in a sentence that is not negated in its own clause. "H2 was not supported"
 * and "we do not interpret this as support" do not count.
 */
export function findSupportLanguage(sentence: string): TextMatch[] {
  const out: TextMatch[] = [];
  for (const m of sentence.matchAll(SUPPORT_RE)) {
    const i = m.index ?? 0;
    const before = sentence.slice(0, i);
    const clauseStart = Math.max(before.lastIndexOf(","), before.lastIndexOf(";"), before.lastIndexOf(":"), before.lastIndexOf("("), before.toLowerCase().lastIndexOf(" but "), before.toLowerCase().lastIndexOf(" although "), before.toLowerCase().lastIndexOf(" while "), before.toLowerCase().lastIndexOf(" whereas "));
    const clause = before.slice(clauseStart + 1);
    if (NEGATION_RE.test(clause)) continue;
    out.push({ start: i, end: i + m[0].length, exact: m[0], pattern: "support" });
  }
  return out;
}

// ───────────────────────── significance and absence claims (R2, R3) ─────────────────────────

export const NONSIGNIFICANCE_PATTERNS: [string, RegExp][] = [
  ["nonsignificant", /\bnon-?significant(?:ly)?\b/i],
  ["not_significant", /\bnot\s+(?:statistically\s+)?significant(?:ly)?\b/i],
  ["ns", /(?<![\w.])n\.s\.(?!\w)/i],
  ["did_not_reach", /\b(?:did\s+not|failed\s+to)\s+reach\s+(?:statistical\s+)?significance\b/i],
  ["p_greater", /\bp\s*[>≥]\s*0?\.\d+/i],
  ["p_equals_large", /\bp\s*=\s*0?\.(?:0[6-9]|[1-9])\d*\b/i],
];

/** Wording that reports a non-significant result. */
export function findNonsignificance(text: string): TextMatch[] {
  return scan(text, NONSIGNIFICANCE_PATTERNS);
}

export const ABSENCE_CLAIM_PATTERNS: [string, RegExp][] = [
  ["no_effect", /\b(?:there\s+(?:was|is|were|are)\s+no|(?:showed|shows|show|found|find|revealed|reveals|had|has|have|yielded)\s+no|no)\s+(?:real\s+|true\s+|actual\s+|meaningful\s+|substantial\s+|practically\s+(?:relevant|meaningful)\s+)?(?:effects?|differences?|relationships?|associations?|correlations?|influence|impact)\b/i],
  ["did_not_differ", /\b(?:did|does|do)\s+not\s+(?:differ|affect|influence|impact|predict|moderate|change)\b(?!\s+significantly)/i],
  ["equivalent", /\b(?:were|was|are|is)\s+(?:statistically\s+|practically\s+)?equivalent\b/i],
  ["absence_of_effect", /\b(?:absence|lack)\s+of\s+(?:an?\s+|any\s+)?(?:effect|difference|relationship|association)\b/i],
  ["null_accepted", /\b(?:accept(?:ed|ing|s)?|confirm(?:ed|ing|s)?|support(?:ed|ing|s)?)\s+(?:for\s+)?the\s+null(?:\s+hypothesis)?\b/i],
  ["unrelated_unaffected", /\b(?:unrelated\s+to|unaffected\s+by)\b/i],
];

/**
 * Affirmative claims that an effect is absent ("there was no effect", "did not differ",
 * "were equivalent"). "No significant difference" and "no evidence for" are statements about
 * the test or the evidence, not claims of absence, and are not matched.
 */
export function findAbsenceClaims(text: string): TextMatch[] {
  return scan(text, ABSENCE_CLAIM_PATTERNS).filter((m) => !/\bno\s+(?:statistically\s+)?significant\b/i.test(m.exact));
}

export const REJECTION_PATTERNS: [string, RegExp][] = [
  ["hypothesis_rejected", /\b(?:H\d+[a-z]?|[Hh]ypothes[ie]s(?:\s+\d+[a-z]?)?)\s+(?:was|were|is|are)\s+(?:therefore\s+|thus\s+|hence\s+)?(?:rejected|refuted|falsified|disconfirmed)\b/],
  ["we_reject_hypothesis", /\bwe\s+(?:therefore\s+|thus\s+)?reject(?:ed)?\s+(?:H\d+[a-z]?|(?:our|the|this)\s+(?:\w+\s+)?hypothes[ie]s)\b/i],
];

/** A hypothesis declared rejected or falsified (not merely "not supported"). */
export function findRejectionClaims(text: string): TextMatch[] {
  return scan(text, REJECTION_PATTERNS);
}

export const ABSENCE_BASIS_PATTERNS: [string, RegExp][] = [
  ["equivalence", /\bequivalen(?:ce|t)\s+(?:test(?:s|ing)?|bounds?|margins?|range|region|interval)\b/i],
  ["tost", /\bTOST\b|\btwo\s+one-sided\s+tests?\b/i],
  ["bayes_factor", /\bBayes(?:ian)?\s+factors?\b|\bBF\s*_?\s*0\s*1\b|\bBF01\b|\bBF\s*[<>=≤≥]/i],
  ["sesoi", /\bSESOI\b|\bsmallest\s+effect(?:\s+size)?\s+of\s+interest\b/i],
  ["rope", /\bROPE\b|\bregion\s+of\s+practical\s+equivalence\b/i],
  ["minimum_effect", /\bminimum[- ]effect\s+test\b|\bnon-?inferiority\b/i],
  ["ci_rules_out", /\b(?:interval|CI)\s+(?:excluded|excludes|ruled\s+out|rules\s+out)\s+(?:effects?|values?)\b|\bruled?\s+out\s+effects?\s+(?:larger|greater|bigger)\s+than\b/i],
];

/** Located bases for an absence or equivalence conclusion (equivalence test, Bayes factor, bounds). */
export function findAbsenceBasis(text: string): TextMatch[] {
  return scan(text, ABSENCE_BASIS_PATTERNS);
}

// ───────────────────────── sidedness (R4) ─────────────────────────

export interface SidednessMatch extends TextMatch {
  sided: "one" | "two";
}

/** Explicitly stated test sidedness ("one-tailed", "two-sided"). Unstated sidedness yields nothing. */
export function findStatedSidedness(text: string): SidednessMatch[] {
  return scan(text, [["sidedness", /\b(one|two|1|2)[\s-](?:tailed|sided)\b/i]]).map((m) => ({
    ...m,
    sided: /^(one|1)/i.test(m.exact) ? ("one" as const) : ("two" as const),
  }));
}

// ───────────────────────── hypothesis labels (R1) ─────────────────────────

export interface LabelOccurrence {
  /** Normalised label: "H" + number + optional letter ("H1", "H2a"). */
  label: string;
  start: number;
  end: number;
  exact: string;
  sectionId?: string;
  sectionClass?: CanonicalSection;
}

const LABEL_RE =
  /\b(?:H\s?(\d+)([a-z])?(?:\s*(?:[–—-]|to)\s*H?\s?(\d+)([a-z])?)?|[Hh]ypothes[ie]s\s+(\d+[a-z]?(?:\s*(?:,|and|&|or|[–—-]|to)\s*\d+[a-z]?)*))\b/g;

function expand(fromNum: number, fromLetter: string | undefined, toNum: number, toLetter: string | undefined): string[] {
  if (fromLetter && toLetter && fromNum === toNum) {
    const out: string[] = [];
    for (let c = fromLetter.charCodeAt(0); c <= toLetter.charCodeAt(0); c++) out.push(`H${fromNum}${String.fromCharCode(c)}`);
    return out;
  }
  if (toNum < fromNum || toNum - fromNum > 30) return [`H${fromNum}${fromLetter ?? ""}`, `H${toNum}${toLetter ?? ""}`];
  const out: string[] = [];
  for (let n = fromNum; n <= toNum; n++) out.push(`H${n}`);
  return out;
}

/**
 * Every hypothesis label in the text ("H1", "H2a", "Hypothesis 3", "Hypotheses 1 and 2",
 * ranges "H1–H3"), each tagged with the section it falls in. "H0" (the null) is ignored.
 */
export function labelInventory(text: string, sections: Section[] = []): LabelOccurrence[] {
  const out: LabelOccurrence[] = [];
  const sectionOf = (i: number) => {
    let best: Section | undefined;
    for (const s of sections) if (i >= s.start && i < s.end && (!best || s.end - s.start < best.end - best.start)) best = s;
    return best;
  };
  for (const m of text.matchAll(LABEL_RE)) {
    const i = m.index ?? 0;
    let labels: string[];
    if (m[1] !== undefined) {
      const a = Number(m[1]);
      labels = m[3] !== undefined ? expand(a, m[2], Number(m[3]), m[4]) : [`H${a}${m[2] ?? ""}`];
    } else {
      const parts = m[5].split(/\s*(?:,|and|&|or)\s*/).flatMap((p) => {
        const r = /^(\d+)([a-z])?\s*(?:[–—-]|to)\s*(\d+)([a-z])?$/.exec(p.trim());
        if (r) return expand(Number(r[1]), r[2], Number(r[3]), r[4]);
        return [`H${p.trim()}`];
      });
      labels = parts;
    }
    const s = sectionOf(i);
    for (const label of labels) {
      if (/^H0[a-z]?$/.test(label)) continue;
      out.push({
        label,
        start: i,
        end: i + m[0].length,
        exact: m[0],
        ...(s ? { sectionId: s.id, sectionClass: sectionClass(s) } : {}),
      });
    }
  }
  return out;
}

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

export interface CountClaim extends TextMatch {
  count: number;
}

/**
 * The authors' own statements of how many hypotheses they test ("we tested three hypotheses").
 * Only sentences in the first person or about the present study count, so a literature review
 * ("previous work tested two hypotheses") is not read as a count claim.
 */
export function findHypothesisCountClaims(text: string): CountClaim[] {
  const out: CountClaim[] = [];
  for (const s of splitSentences(text)) {
    if (!/\b(?:we|our|this\s+(?:study|paper|article|research)|the\s+(?:present|current)\s+(?:study|research|paper))\b/i.test(s.text)) continue;
    const re = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d{1,2})\s+(?:main\s+|primary\s+|pre-?registered\s+|confirmatory\s+|central\s+|specific\s+)?(?:hypotheses|predictions)\b/gi;
    for (const m of s.text.matchAll(re)) {
      const raw = m[1].toLowerCase();
      const count = NUMBER_WORDS[raw] ?? Number(raw);
      const st = s.start + (m.index ?? 0);
      out.push({ start: st, end: st + m[0].length, exact: m[0], pattern: "count_claim", count });
    }
  }
  return out;
}

// ───────────────────────── subgroup significance (R6) ─────────────────────────

export const SUBGROUP_PATTERNS: [string, RegExp][] = [
  ["significant_but_not", /\bsignificant\b[^.;]{0,120}?\b(?:for|in|among|within)\b[^.;]{0,80}?\bbut\s+not\s+(?:for|in|among|within)\b/i],
  ["significant_whereas_not", /\bsignificant\b[^.;]{0,120}?\b(?:whereas|while)\b[^.;]{0,120}?\b(?:was|were|is|are)\s+not(?:\s+significant)?\b/i],
];

/** "Significant for women but not for men": a difference in significance used as a difference. */
export function findSubgroupSignificance(text: string): TextMatch[] {
  return scan(text, SUBGROUP_PATTERNS);
}

/** Wording that reports a test of the difference itself (an interaction or a comparison of effects). */
export const INTERACTION_TEST_RE =
  /\binteraction\b|\bmoderation\s+(?:test|analysis|effect)\b|\bdifference\s+between\s+(?:the\s+)?(?:effects|slopes|coefficients|correlations)\b/i;

/** Hypothesis wording that predicts moderation (the effect differs between groups or conditions). */
export const MODERATION_HYPOTHESIS_RE =
  /\b(?:moderat\w*|interact\w*|stronger|weaker|depends?\s+on|more\s+pronounced|less\s+pronounced|attenuat\w*|amplif\w*)\b/i;
