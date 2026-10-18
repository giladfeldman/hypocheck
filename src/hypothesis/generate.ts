/**
 * Turns a Project into text: hypothesis labels (H1, H1a, A1, E1 …), statements,
 * the summary sentence, variable lists/definitions, results and discussion
 * templates, and the PCI-RR study design table.
 *
 * Mirrors the "Output …" tabs of the v0.5 spreadsheet, with these corrections:
 *  - variable lists are built from the variables themselves (the sheet read
 *    shifted rows from row 14 onward, mislisting Accuracy and Pure logic);
 *  - subset lettering continues past "_d" (the sheet tested M=4 twice);
 *  - unlisted rows get their own labels (A1 auxiliary, MC1 manipulation check,
 *    E1 exploratory, U1 other) instead of a bare "H" in the templates;
 *  - spaces around "compared to" / "in the condition of".
 */
import type { Hypothesis, Project, Variable } from "./schema.js";
import { ASSOCIATIONS, QUALIFICATIONS, VARIABLE_ROLES, VARIABLE_TYPES, associationById } from "./vocab.js";

export type Labelled = {
  hypothesis: Hypothesis;
  label: string;
  /** Listed = counted as a numbered hypothesis (H…). */
  listed: boolean;
  /** Kind after inheritance from the group head (subsets of an exploratory row are exploratory). */
  effectiveKind: string;
  groupIndex: number;
};

const UNLISTED_PREFIX: Record<string, string> = {
  auxiliary: "A",
  manipulation_check: "MC",
  exploratory: "E",
};

function letter(i: number): string {
  // a..z, then aa, ab … (the sheet stopped at "_d")
  let n = i;
  let s = "";
  do {
    s = String.fromCharCode(97 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export function labelHypotheses(hypotheses: Hypothesis[]): Labelled[] {
  // 1. group rows: a head (main/unlisted) followed by its subset rows
  const groups: Hypothesis[][] = [];
  for (const h of hypotheses) {
    if (h.listing === "subset" && groups.length > 0) groups[groups.length - 1].push(h);
    else groups.push([h]);
  }
  let main = 0;
  const unlistedCounters: Record<string, number> = {};
  const out: Labelled[] = [];
  groups.forEach((group, gi) => {
    const head = group[0];
    const listed = head.listing !== "unlisted";
    let base: string;
    if (listed) {
      main += 1;
      base = `H${main}`;
    } else {
      const prefix = UNLISTED_PREFIX[head.kind] ?? "U";
      unlistedCounters[prefix] = (unlistedCounters[prefix] ?? 0) + 1;
      base = `${prefix}${unlistedCounters[prefix]}`;
    }
    group.forEach((h, i) => {
      const inherits = !listed && !h.kind ? head.kind : h.kind;
      out.push({
        hypothesis: h,
        label: group.length > 1 ? `${base}${letter(i)}` : base,
        listed,
        effectiveKind: inherits,
        groupIndex: gi,
      });
    });
  });
  return out;
}

function quote(name: string): string {
  const n = name.trim();
  if (!n) return "[?]";
  if (/^["“].*["”]$/.test(n)) return n;
  return `"${n}"`;
}

/** Display name of a ref ("v:<id>" variable or "h:<id>" named effect). */
export function refName(project: Project, ref: string): string {
  if (!ref) return "";
  if (ref.startsWith("v:")) {
    const v = project.variables.find((x) => x.id === ref.slice(2));
    return v?.name ?? "";
  }
  if (ref.startsWith("h:")) {
    const h = project.hypotheses.find((x) => x.id === ref.slice(2));
    return h?.effectName ?? "";
  }
  return "";
}

const KIND_SUFFIX: Record<string, string> = {
  focal: "this is the focal hypothesis",
  auxiliary: "this is an auxiliary assumption",
  manipulation_check: "this is a manipulation check",
  exploratory: "this is exploratory",
};

/** The core prediction sentence, without label or kind suffix. */
export function predictionSentence(project: Project, h: Hypothesis, tense: "will" | "would" = "will"): string {
  const a = quote(refName(project, h.first));
  const assoc = associationById(h.association);
  let s: string;
  if (!assoc) {
    s = `${a} [association not chosen] ${quote(refName(project, h.second))}`;
  } else {
    s = assoc.phrase.replace("{A}", a).replace("{B}", quote(refName(project, h.second)));
  }
  const qual = QUALIFICATIONS.find((q) => q.id === h.qualification);
  if (qual && h.qualifier) s += ` ${qual.phrase.replace("{C}", quote(refName(project, h.qualifier)))}`;
  if (tense === "would") s = s.replace(" will ", " would ");
  return s;
}

export function statement(project: Project, l: Labelled): string {
  const suffix = KIND_SUFFIX[l.effectiveKind];
  return `${l.label}: ${predictionSentence(project, l.hypothesis)}${suffix ? ` (${suffix})` : ""}.`;
}

export function summarySentence(project: Project): string {
  const labelled = labelHypotheses(project.hypotheses);
  const listedGroups = new Map<number, number>();
  for (const l of labelled) if (l.listed) listedGroups.set(l.groupIndex, (listedGroups.get(l.groupIndex) ?? 0) + 1);
  const mains = listedGroups.size;
  const withSubs = [...listedGroups.values()].filter((n) => n > 1).length;
  const total = labelled.filter((l) => l.listed).length;
  const focal = labelled.filter((l) => l.effectiveKind === "focal").length;
  const aux = labelled.filter((l) => l.effectiveKind === "auxiliary").length;
  const mc = labelled.filter((l) => l.effectiveKind === "manipulation_check").length;
  const expl = labelled.filter((l) => l.effectiveKind === "exploratory").length;
  const parts: string[] = [];
  parts.push(`This study has ${mains} main ${mains === 1 ? "hypothesis" : "hypotheses"}.`);
  if (withSubs > 0) {
    parts.push(
      `Of these, ${withSubs} ${withSubs === 1 ? "has" : "have"} subordinate hypotheses, for a total of ${total} ${total === 1 ? "hypothesis" : "hypotheses"}.`,
    );
  }
  parts.push(
    focal === 0
      ? "No focal hypothesis has been specified."
      : focal === 1
        ? "A focal hypothesis has been specified."
        : `More than one focal hypothesis has been specified (${focal}).`,
  );
  const extras: string[] = [];
  if (aux) extras.push(`${aux} auxiliary ${aux === 1 ? "assumption" : "assumptions"}`);
  if (mc) extras.push(`${mc} manipulation ${mc === 1 ? "check" : "checks"}`);
  if (expl) extras.push(`${expl} exploratory ${expl === 1 ? "test" : "tests"}`);
  if (extras.length) parts.push(`There ${extras.length === 1 && (aux === 1 || mc === 1 || expl === 1) ? "is" : "are"} also ${joinList(extras)}.`);
  return parts.join(" ");
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function hypothesisStatements(project: Project): string[] {
  return labelHypotheses(project.hypotheses).map((l) => statement(project, l));
}

export function variableLists(project: Project): { role: string; label: string; names: string[] }[] {
  return VARIABLE_ROLES.map((r) => ({
    role: r.id,
    label: r.label,
    names: project.variables.filter((v) => v.role === r.id && v.name.trim()).map((v) => v.name.trim()),
  }));
}

export function variableDefinition(v: Variable): string {
  const role = VARIABLE_ROLES.find((r) => r.id === v.role)?.label.toLowerCase();
  const type = VARIABLE_TYPES.find((t) => t.id === v.type)?.label.toLowerCase();
  const name = quote(v.name);
  let s = `The variable ${name}`;
  if (type) s += ` is a ${type} variable`;
  if (role) s += `${type ? " that has" : " has"} the role of ${role} in the hypotheses`;
  s += ".";
  if (v.description.trim()) s += ` ${name} is defined as: ${v.description.trim()}`;
  if (v.operationalization.trim()) s += ` ${name} is operationalized as: ${v.operationalization.trim()}`;
  return s;
}

const SIZE_WORDS = "[negligible / very small / small / medium / large / very large / huge]";

export function resultsTemplate(project: Project, l: Labelled): string {
  const h = l.hypothesis;
  const test = h.inference.test.trim() || "[statistical test]";
  let s = `Hypothesis ${l.label} stated that ${predictionSentence(project, h, "would")}. This was tested with ${test}.`;
  s += ` The estimate was [effect size and 95% CI].`;
  if (h.effectSize.optimistic.trim() && h.effectSize.pessimistic.trim()) {
    s += ` This falls in the [optimistic / acceptable / concerning / inconclusive] zone (optimistic bound: ${h.effectSize.optimistic.trim()}; pessimistic bound: ${h.effectSize.pessimistic.trim()}).`;
  } else if (h.effectSize.sesoi.trim()) {
    s += ` Compared with the smallest effect size of interest (${h.effectSize.sesoi.trim()}), the effect was [larger than / equivalent to zero within / inconclusive relative to] it.`;
  }
  s += ` This test showed [support / failure to support / ambivalent support] for the hypothesis, with a ${SIZE_WORDS} effect size.`;
  return s;
}

export function discussionTemplate(project: Project, l: Labelled): string {
  const h = l.hypothesis;
  const theory = h.theory.trim() ? quote(h.theory) : "[theory]";
  const mech = h.mechanism.trim() ? quote(h.mechanism) : "[mechanism]";
  const effect = h.effectName.trim() ? `the ${quote(h.effectName)} effect` : "the predicted effect";
  let s = `We proposed, based on ${theory}, that the mechanism of ${mech} would lead to ${effect} (hypothesis ${l.label}), which stated that ${predictionSentence(project, h, "would")}.`;
  s += ` Our results [were in line with / were not in line with / were ambivalent with regard to] this prediction, with a ${SIZE_WORDS} effect size.`;
  if (h.falsification.falsifies.trim()) {
    s += ` We had specified in advance that the hypothesis would be considered falsified if ${h.falsification.falsifies.trim().replace(/\.$/, "")}.`;
  }
  s += ` This [supported / did not support / showed ambivalent support for] the ${mech} mechanism`;
  s += h.theoryAtStake.trim() ? `, and thereby [corroborated / challenged / did not inform] ${quote(h.theoryAtStake)}.` : ".";
  return s;
}

export type DesignTableRow = {
  label: string;
  question: string;
  hypothesis: string;
  samplingPlan: string;
  analysisPlan: string;
  sensitivityRationale: string;
  interpretation: string;
  theoryAtStake: string;
};

/**
 * Rows for the PCI Registered Reports study design table (one row per hypothesis).
 * Column meanings checked against the PCI RR guide for authors (2026-10-13):
 * auxiliary-assumption tests (manipulation checks, positive controls) belong in
 * the table as hypotheses too, so unlisted rows are included.
 */
export function designTable(project: Project): DesignTableRow[] {
  return labelHypotheses(project.hypotheses).map((l) => {
    const h = l.hypothesis;
    const inf = h.inference;
    const analysis = [
      inf.test,
      inf.alpha && `α = ${inf.alpha}`,
      inf.sided && `${inf.sided}-sided`,
      inf.correction && `correction: ${inf.correction}`,
      inf.bayes && `Bayesian: ${inf.bayes}`,
    ]
      .filter(Boolean)
      .join("; ");
    const es = h.effectSize;
    const sens = [
      es.sesoi && `SESOI ${es.metric ? `(${es.metric}) ` : ""}= ${es.sesoi}`,
      es.optimistic && `optimistic bound ${es.optimistic}`,
      es.pessimistic && `pessimistic bound ${es.pessimistic}`,
      es.justification,
    ]
      .filter(Boolean)
      .join("; ");
    const f = h.falsification;
    const interp = [
      f.supports && `Support: ${f.supports}`,
      f.falsifies && `Falsified: ${f.falsifies}`,
      f.inconclusive && `Inconclusive: ${f.inconclusive}`,
    ]
      .filter(Boolean)
      .join(" ");
    return {
      label: l.label,
      question: project.context.researchQuestion,
      hypothesis: statement(project, l),
      samplingPlan: h.samplingPlan || project.context.samplingPlan,
      analysisPlan: analysis,
      sensitivityRationale: sens,
      interpretation: interp,
      theoryAtStake: h.theoryAtStake || h.theory,
    };
  });
}

export { ASSOCIATIONS };
