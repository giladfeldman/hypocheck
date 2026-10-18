/**
 * Deterministic hypothesis-quality checks. These are authoritative: the AI
 * critique only adds suggestions on top and never changes a check's status.
 *
 * What they are and are not: the checks look at whether each element has been
 * written down and is not of a known-bad form (e.g. "not significant = no
 * effect"). They cannot judge whether the content is good — that is what the
 * labels "missing" / "improve" and the optional AI reviewer are for.
 *
 * Each criterion carries its sources (citations.ts; DOIs verified against
 * Crossref, claims checked against the abstracts 2026-10-13) and a `basis`:
 * "literature" when the criterion itself comes from the cited work, "convention"
 * when it is a teaching rule of this tool (inherited from the v0.5 sheet or
 * chosen here) that the sources motivate but do not prescribe.
 *
 * Reviewed by a second model (tier-2 consult, Sonnet, 2026-10-13); the reproduced
 * findings are regression tests in criteria.test.ts.
 *
 * 2026-10-18 (d-5b4e0d): every criterion now cites at least one DOI source. Criterion 15
 * adds Scheel et al. 2021 (abstract: tests inform theory only through a sound derivation
 * chain between test and theory); criterion 18 cites Lakens & DeBruine 2021 (abstract:
 * specify a test so that whether the prediction is corroborated can be evaluated
 * mechanically — a hedged rule cannot be). Criterion 18's hedge list is ours, so its
 * basis stays "convention".
 */
import type { Hypothesis, Project, Variable } from "../hypothesis/schema.js";
import { labelHypotheses, refName, type Labelled } from "../hypothesis/generate.js";
import { associationById } from "../hypothesis/vocab.js";
import { cite, type Citation } from "./citations.js";

/**
 * "pending" = not yet assessable: the part the criterion looks at is still empty, so it
 * can neither pass nor fail yet (d-a317a6: a blank hypothesis used to collect passes).
 * It counts as applicable but not passed, and is not a failure. "na" = does not apply.
 */
export type Status = "pass" | "warn" | "fail" | "na" | "pending";

export type CheckResult = {
  criterion: string;
  status: Status;
  message: string;
};

export type Criterion = {
  id: string;
  number: number;
  title: string;
  /** Why it matters, one or two sentences, plain language. */
  why: string;
  fix: string;
  sources: Citation[];
  basis: "literature" | "convention";
};

export const CRITERIA: Criterion[] = [
  {
    id: "variables",
    number: 1,
    title: "Variables are named and given a role",
    why: "A hypothesis is a claim about specific variables; the variables are one of the dimensions that set a hypothesis's scope. Unnamed or role-less variables make it unclear what is predicted to affect what.",
    fix: "Give every variable a short name and say whether it is a predictor, manipulation, outcome, moderator, mediator, background or control variable.",
    sources: cite("thompson2023"),
    basis: "literature",
  },
  {
    id: "operationalized",
    number: 2,
    title: "Each variable is operationalized",
    why: "The link from concept to measurement is part of the chain from theory to prediction. If it is not written down, any result can be reinterpreted afterwards.",
    fix: "For each variable, write the concrete manipulation or measure and how scores are computed.",
    sources: cite("scheel2021", "bakker2020"),
    basis: "literature",
  },
  {
    id: "single_claim",
    number: 3,
    title: "One complete prediction per hypothesis",
    why: "In a study of preregistrations, coders agreed on how many hypotheses a preregistration contained in only 14% of cases. One numbered, complete statement per prediction removes that ambiguity.",
    fix: "Choose a first variable, an association and (where needed) a second variable. Split compound predictions into subset hypotheses (H1a, H1b …). A variable should appear only once per hypothesis.",
    sources: cite("bakker2020"),
    basis: "literature",
  },
  {
    id: "direction",
    number: 4,
    title: "The direction of the effect is stated",
    why: "\"X affects Y\" is supported by an effect in either direction, so it is a weak test. Direction is also not stable in practice: in 18% of preregistered studies a hypothesis's direction changed between preregistration and paper.",
    fix: "Say whether the outcome is expected to be higher or lower (for a moderator: whether it strengthens or weakens the effect). Use a non-directional prediction only if theory truly gives no direction.",
    sources: cite("meehl1967", "vandenakker2023"),
    basis: "literature",
  },
  {
    id: "comparison",
    number: 5,
    title: "The comparison is stated (compared to what?)",
    why: "\"Group A will score higher\" is only testable once you say higher than which group, condition or value.",
    fix: "Add a qualification \"compared to …\" naming the reference group or condition, or predict against a fixed value such as chance level.",
    sources: cite("lakensdebruine2021"),
    basis: "literature",
  },
  {
    id: "form",
    number: 6,
    title: "The form of the relationship is stated",
    why: "For continuous predictors, a linear trend, a threshold and an inverted U make different predictions; leaving the form open lets almost any pattern count as support.",
    fix: "Pick the expected form: linear/monotonic, threshold, curvilinear, interaction or mediation.",
    sources: cite("thompson2023", "meehl1967"),
    basis: "literature",
  },
  {
    id: "sesoi",
    number: 7,
    title: "The smallest effect size of interest (or expected bounds) is stated",
    why: "Without a smallest effect that would matter, a trivially small effect counts as support and a null result can never count against the hypothesis. Equivalence tests need it.",
    fix: "State the effect-size metric and the smallest effect you would care about (SESOI), or an optimistic and a pessimistic bound, and justify the value (theory, practical relevance, resources) rather than copying a prior study's observed effect.",
    sources: cite("lakens2018", "lakens2022"),
    basis: "literature",
  },
  {
    id: "inference",
    number: 8,
    title: "The inference criterion is stated",
    why: "The test and the decision threshold decide what counts as a result. Leaving them open invites flexible analysis.",
    fix: "Name the statistical test and the α level or Bayes factor threshold; say whether it is one- or two-sided and how you correct for multiple tests.",
    sources: cite("lakensdebruine2021"),
    basis: "literature",
  },
  {
    id: "falsification",
    number: 9,
    title: "The result that would count against the hypothesis is stated",
    why: "A hypothesis is testable only if some possible result would count against it. Saying which result in advance stops it being redefined after the data are in. A non-significant result alone is not evidence of no effect.",
    fix: "Write what supports it, what counts against it and what is inconclusive. For a directional hypothesis, counter-evidence is e.g. an effect reliably smaller than the SESOI (equivalence or minimum-effect test) or a reliable effect in the opposite direction.",
    sources: cite("popper1959", "lakens2018", "pcirr"),
    basis: "literature",
  },
  {
    id: "population",
    number: 10,
    title: "Population and boundary conditions are stated",
    why: "Saying for whom and under which conditions the prediction holds demarcates what is actually being tested; without it a failed prediction can be dismissed as \"not applying here\".",
    fix: "State the population (and sample), the setting, and any conditions under which the effect is not expected.",
    sources: cite("thompson2023"),
    basis: "literature",
  },
  {
    id: "auxiliary",
    number: 11,
    title: "Auxiliary assumptions are listed",
    why: "Every test also assumes the measures are valid, the manipulation worked, there are no floor or ceiling effects, and so on. A failed prediction can always be blamed on these, so they should be stated — and, where possible, tested.",
    fix: "List the assumptions this test relies on, and add auxiliary-assumption or manipulation-check rows for the ones you will test.",
    sources: cite("meehl1990", "pcirr"),
    basis: "literature",
  },
  {
    id: "manipulation_check",
    number: 12,
    title: "There is a plan to show each manipulation worked",
    why: "If a manipulation fails, a null result says nothing about the hypothesis. Plan how you will know it worked — a manipulation check, a pilot or a positive control — keeping in mind that verbal checks can themselves change the effect.",
    fix: "Add a manipulation-check or auxiliary row that tests the manipulated variable, or note in this hypothesis's auxiliary assumptions how the manipulation was validated (naming the variable, e.g. \"Time pressure manipulation validated in a pilot\").",
    sources: cite("hauser2018", "pcirr"),
    basis: "convention",
  },
  {
    id: "mechanism",
    number: 13,
    title: "The mechanism is stated",
    why: "Saying why X should affect Y is what links the hypothesis to theory and suggests what else should be observed.",
    fix: "Describe in one or two sentences the process that produces the effect.",
    sources: cite("borsboom2021"),
    basis: "literature",
  },
  {
    id: "derivation",
    number: 14,
    title: "The derivation from theory is explicit",
    why: "The chain from theory to prediction usually contains hidden steps (auxiliary assumptions, operationalizations). Writing it out shows whether the prediction really follows from the theory; formal models make it explicit.",
    fix: "Write the steps: theory says …; in this design that means …; therefore we predict ….",
    sources: cite("scheel2021", "oberauer2019"),
    basis: "literature",
  },
  {
    id: "theory_at_stake",
    number: 15,
    title: "The theory that could be shown wrong is named",
    why: "If no theory would be weakened by a failed prediction, the study cannot teach us much about theory.",
    fix: "Name the theory (or theory component) that would be shown wrong, incomplete or inadequate if the prediction fails.",
    sources: cite("pcirr", "scheel2021"),
    basis: "literature",
  },
  {
    id: "severity",
    number: 16,
    title: "The test is set up to be able to fail",
    why: "A test is severe if the prediction would probably fail were the theory wrong. A non-directional prediction with no effect-size bound and no stated counter-evidence passes almost always; in correlational data, small non-zero correlations are expected anyway. (This check only sees whether the elements are stated — severity also depends on power.)",
    fix: "Add a direction, a smallest effect of interest and the result that would count against the hypothesis.",
    sources: cite("mayo2018", "meehl1967"),
    basis: "convention",
  },
  {
    id: "confirmatory",
    number: 17,
    title: "Confirmatory vs exploratory status and priority are clear",
    why: "Hypotheses are often changed between plan and paper: in one study, 52% of preregistered studies had omitted and 57% had added hypotheses. Clear labels (which test is primary, which are exploratory) make that visible.",
    fix: "Mark the focal (primary) hypothesis, and mark exploratory tests as exploratory.",
    sources: cite("vandenakker2023"),
    basis: "literature",
  },
  {
    id: "scope",
    number: 18,
    title: "Predictions and criteria are worded definitely",
    why: "Words like \"may\", \"could\" or \"possibly\" in what counts as support or counter-evidence make that rule compatible with almost any data.",
    fix: "Replace hedges in the support / counter-evidence rules with a definite statement.",
    sources: cite("lakensdebruine2021"),
    basis: "convention",
  },
];

export const CRITERION_BY_ID = Object.fromEntries(CRITERIA.map((c) => [c.id, c]));

const HEDGE = /\b(may|might|could|possibly|perhaps|potentially|somewhat|to some extent|tends? to|probably|likely|roughly)\b/i;
const NOT_SIG_ONLY = /(non-?significant|not (statistically )?significant|\bn\.s\.|p\s*[>≥]\s*0?\.\d)/i;
// References that make a "not significant" rule into a proper counter-evidence rule.
const COUNTER_EVIDENCE =
  /(equivalen\w*|\btost\b|sesoi|smallest effect|\bbounds?\b|\bmargin\b|inferiority|\brope\b|region of practical|minimum[- ]effect|opposite direction|reverse direction|bayes factor|\bbf\s*0?1\b|\bbf\s*[<>])/i;

function filled(s: string | undefined): boolean {
  return !!s && s.trim().length > 0;
}

/** A smallest effect of interest, or BOTH an optimistic and a pessimistic bound (criterion 7). */
export function hasEffectBounds(h: Hypothesis): boolean {
  return filled(h.effectSize.sesoi) || (filled(h.effectSize.optimistic) && filled(h.effectSize.pessimistic));
}

/** The "bounds and falsifier set" mark in the builder: the same predicates the checks use. */
export function predictionBoundsDone(h: Hypothesis): boolean {
  return filled(h.falsification.falsifies) && hasEffectBounds(h);
}

function varOf(project: Project, ref: string): Variable | undefined {
  if (!ref.startsWith("v:")) return undefined;
  return project.variables.find((v) => v.id === ref.slice(2));
}

function isConfirmatory(l: Labelled): boolean {
  return l.listed && l.effectiveKind !== "exploratory";
}

function refsOf(h: Hypothesis): string[] {
  return [h.first, h.second, h.qualifier].filter(Boolean);
}

function r(criterion: string, status: Status, message: string): CheckResult {
  return { criterion, status, message };
}

/** Run all criteria for one hypothesis. */
export function checkHypothesis(project: Project, l: Labelled, all: Labelled[]): CheckResult[] {
  const h = l.hypothesis;
  const out: CheckResult[] = [];
  const confirm = isConfirmatory(l);
  const focal = l.effectiveKind === "focal";
  const exploratory = l.effectiveKind === "exploratory";
  const assoc = associationById(h.association);
  const refs = refsOf(h);

  // 1 variables
  const unresolved = refs.filter((ref) => !refName(project, ref).trim());
  const roleless = refs.map((ref) => varOf(project, ref)).filter((v): v is Variable => !!v && !v.role);
  const variablesMissing = !h.first || (!h.second && (!assoc || assoc.needsSecond));
  if (unresolved.length) out.push(r("variables", "fail", "A variable in this hypothesis has no name (or was deleted)."));
  else if (roleless.length) out.push(r("variables", "warn", `No role set for: ${roleless.map((v) => v.name).join(", ")}.`));
  else if (variablesMissing) out.push(r("variables", "pending", "Not yet assessable: choose the variables of the prediction first."));
  else out.push(r("variables", "pass", "All variables are named and have a role."));

  // 2 operationalized
  const vars = refs.map((ref) => varOf(project, ref)).filter((v): v is Variable => !!v);
  const unop = vars.filter((v) => !filled(v.operationalization));
  if (!vars.length) out.push(r("operationalized", "na", "Only named effects are used; operationalize the variables they are built from."));
  else if (unop.length) out.push(r("operationalized", confirm ? "fail" : "warn", `Not yet operationalized: ${unop.map((v) => v.name).join(", ")}.`));
  else out.push(r("operationalized", "pass", "Every variable used here is operationalized."));

  // 3 single complete claim
  const selfRef = refs.includes(`h:${h.id}`);
  const dup = new Set(refs).size !== refs.length;
  if (!h.first || !assoc || (assoc.needsSecond && !h.second)) {
    out.push(r("single_claim", "fail", "The prediction is incomplete: choose a first variable, an association and a second variable."));
  } else if (selfRef) {
    out.push(r("single_claim", "fail", "The hypothesis uses its own named effect as a variable (circular)."));
  } else if (dup) {
    out.push(r("single_claim", "fail", "The same variable appears twice in this hypothesis."));
  } else out.push(r("single_claim", "pass", "One complete prediction."));

  const bounded = hasEffectBounds(h);

  // 4 direction
  if (!assoc) out.push(r("direction", "fail", "No association chosen."));
  else if (assoc.direction === "nondirectional")
    out.push(
      r(
        "direction",
        confirm ? "warn" : "pass",
        "Non-directional: an effect in either direction would count as support. For a moderator, choose strengthen or weaken if theory says which.",
      ),
    );
  else if (assoc.direction === "equivalence")
    out.push(
      bounded
        ? r("direction", "pass", "Equivalence prediction with equivalence bounds.")
        : r("direction", "fail", "An equivalence (\"no meaningful difference\") prediction needs equivalence bounds (SESOI)."),
    );
  else out.push(r("direction", "pass", "Direction stated."));

  // 5 comparison — a level of a categorical or binary variable always needs a reference
  const first = varOf(project, h.first);
  const groupFirst = first?.type === "categorical_level" || first?.type === "binary";
  if (assoc?.direction === "chance") out.push(r("comparison", "pass", "Compared against chance level."));
  else if (!groupFirst)
    out.push(
      r(
        "comparison",
        "na",
        first ? "The first variable is not a group level, so the comparison is implicit (higher vs lower values)." : "The first term is a named effect; the comparison is defined in that hypothesis.",
      ),
    );
  else if (h.qualification === "compared_to" && h.qualifier) out.push(r("comparison", "pass", "Reference condition stated."));
  else if (first?.type === "binary") out.push(r("comparison", "pass", `"${first.name}" is binary: the comparison is with its absence.`));
  else out.push(r("comparison", "warn", `"${first?.name}" is one level of a categorical variable — compared to which other level?`));

  // 6 functional form — only meaningful for non-group predictors
  if (filled(h.functionalForm)) out.push(r("form", "pass", "Form of the relationship stated."));
  else if (groupFirst || assoc?.direction === "chance" || assoc?.direction === "equivalence")
    out.push(r("form", "na", "A group difference, chance-level or equivalence prediction — the form is implied."));
  else out.push(r("form", confirm ? "warn" : "na", "Form not stated (linear, threshold, curvilinear, interaction …)."));

  // 7 SESOI / bounds
  if (bounded) {
    out.push(
      filled(h.effectSize.metric)
        ? r("sesoi", "pass", "Effect size of interest stated.")
        : r("sesoi", "warn", "Effect size stated, but on which metric (d, r, OR, raw units …)?"),
    );
  } else if (!confirm) out.push(r("sesoi", "na", "Not required for exploratory or unlisted tests."));
  else out.push(r("sesoi", focal ? "fail" : "warn", "No smallest effect size of interest or bounds."));

  // 8 inference
  const hasCrit = filled(h.inference.alpha) || filled(h.inference.bayes);
  if (filled(h.inference.test) && hasCrit) out.push(r("inference", "pass", "Test and decision threshold stated."));
  else if (exploratory) out.push(r("inference", "na", "Optional for exploratory tests."));
  else out.push(r("inference", "warn", filled(h.inference.test) ? "No α level or Bayes factor threshold." : "No statistical test named."));

  // 9 falsification
  const f = h.falsification;
  if (!filled(f.falsifies)) {
    out.push(r("falsification", !confirm ? "na" : focal ? "fail" : "warn", "No result stated that would count against the hypothesis."));
  } else if (NOT_SIG_ONLY.test(f.falsifies) && !COUNTER_EVIDENCE.test(f.falsifies)) {
    out.push(
      r(
        "falsification",
        "warn",
        "\"Not significant\" is not evidence of no effect — test against the smallest effect of interest (equivalence or minimum-effect test, or a Bayes factor for an interval).",
      ),
    );
  } else out.push(r("falsification", "pass", "Counter-evidence stated."));

  // 10 population
  if (filled(h.population) || filled(project.context.population)) out.push(r("population", "pass", "Population stated."));
  else out.push(r("population", "warn", "No population or boundary conditions (here or in the study context)."));

  // 11 auxiliary assumptions — own list, or an auxiliary/check row sharing a variable with this hypothesis
  const ownRefs = new Set(refs);
  const relatedAux = all.some(
    (x) =>
      x.hypothesis.id !== h.id &&
      (x.effectiveKind === "auxiliary" || x.effectiveKind === "manipulation_check") &&
      refsOf(x.hypothesis).some((ref) => ownRefs.has(ref)),
  );
  if (!confirm) out.push(r("auxiliary", "na", "Not required for exploratory or unlisted tests."));
  else if (h.auxiliaryAssumptions.some(filled) || relatedAux) out.push(r("auxiliary", "pass", "Auxiliary assumptions are listed."));
  else out.push(r("auxiliary", "warn", "No auxiliary assumptions listed for this hypothesis."));

  // 12 manipulation validated
  const manipulated = vars.filter((v) => v.role === "manipulated");
  if (!confirm || !manipulated.length) {
    out.push(r("manipulation_check", "na", confirm ? "No manipulated variable in this hypothesis." : "Not required for exploratory or unlisted tests."));
  } else {
    const auxText = h.auxiliaryAssumptions.join(" ").toLowerCase();
    const validated = (v: Variable) =>
      all.some(
        (x) =>
          (x.effectiveKind === "manipulation_check" || x.effectiveKind === "auxiliary") && refsOf(x.hypothesis).includes(`v:${v.id}`),
      ) || (v.name.trim().length > 0 && auxText.includes(v.name.trim().toLowerCase()));
    const missing = manipulated.filter((v) => !validated(v));
    if (!missing.length) out.push(r("manipulation_check", "pass", "Each manipulation has a check, control or validation note."));
    else out.push(r("manipulation_check", "warn", `No plan yet to show this manipulation worked: ${missing.map((v) => v.name).join(", ")}.`));
  }

  // 13 mechanism
  if (filled(h.mechanism)) out.push(r("mechanism", "pass", "Mechanism stated."));
  else out.push(r("mechanism", confirm ? "warn" : "na", "No mechanism stated."));

  // 14 derivation
  if (filled(h.derivation)) out.push(r("derivation", "pass", "Derivation from theory written out."));
  else out.push(r("derivation", confirm && filled(h.theory) ? "warn" : "na", "The steps from theory to this prediction are not written out."));

  // 15 theory at stake
  if (filled(h.theoryAtStake)) out.push(r("theory_at_stake", "pass", "Theory at stake named."));
  else if (!confirm) out.push(r("theory_at_stake", "na", "Not required for exploratory or unlisted tests."));
  else if (filled(h.theory)) out.push(r("theory_at_stake", "warn", `Background theory given ("${h.theory}"), but which part would be shown wrong?`));
  else out.push(r("theory_at_stake", "warn", "No theory named."));

  // 16 severity (elements present; power is not assessed)
  const directional = !!assoc && assoc.direction !== "nondirectional";
  const counter = filled(f.falsifies);
  const correlational = vars.length >= 2 && vars.every((v) => v.role !== "manipulated");
  if (!confirm) out.push(r("severity", "na", "Not judged for exploratory or unlisted tests."));
  else if (!assoc) out.push(r("severity", "na", "Choose an association first."));
  else if (directional && bounded && counter) out.push(r("severity", "pass", "Direction, effect-size bounds and counter-evidence are all stated."));
  else if (!directional && !bounded && !counter) out.push(r("severity", "fail", "Almost any result would count as support."));
  else
    out.push(
      r(
        "severity",
        "warn",
        correlational && !bounded
          ? "A correlational prediction without a minimum effect: small non-zero correlations are expected anyway."
          : "Could fail more easily if wrong: state direction, a smallest effect of interest and the counter-evidence.",
      ),
    );

  // 17 confirmatory status — per hypothesis: exploratory rows that are numbered
  const blank = !h.first && !h.second && !h.association;
  if (blank) out.push(r("confirmatory", "pending", "Not yet assessable: write the prediction first."));
  else if (l.listed && h.kind === "exploratory")
    out.push(r("confirmatory", "warn", "Marked exploratory but numbered as a main/subset hypothesis — consider \"Unlisted\"."));
  else out.push(r("confirmatory", "pass", l.listed ? "Confirmatory hypothesis." : "Status is clear."));

  // 18 definite wording in the decision rules (mechanisms may legitimately be tentative)
  const ruleText = [f.supports, f.falsifies, f.inconclusive].join(" ");
  const hedge = ruleText.match(HEDGE)?.[0];
  if (hedge) out.push(r("scope", "warn", `Hedged wording in the decision rules ("${hedge}") — state them definitely.`));
  else if (!ruleText.trim()) out.push(r("scope", "pending", "Not yet assessable: no support / counter-evidence rules written yet."));
  else out.push(r("scope", "pass", "No hedges in the decision rules."));

  return out;
}

export type ProjectIssue = { criterion: string; status: Status; message: string };

/** Project-level checks (from the v0.5 sheet, plus variable hygiene). */
export function checkProject(project: Project): ProjectIssue[] {
  const all = labelHypotheses(project.hypotheses);
  const issues: ProjectIssue[] = [];
  const focal = all.filter((l) => l.effectiveKind === "focal").length;
  const listed = all.filter((l) => l.listed).length;
  if (focal > 1)
    issues.push({
      criterion: "confirmatory",
      status: "warn",
      message: `More than one focal hypothesis (${focal}). Fine for co-primary outcomes; otherwise mark only the main test as focal.`,
    });
  else if (focal === 0 && listed > 1)
    issues.push({ criterion: "confirmatory", status: "warn", message: "No focal hypothesis has been specified. Leave it so only if all hypotheses are equally central." });
  const names = project.variables.map((v) => v.name.trim().toLowerCase()).filter(Boolean);
  const dupNames = [...new Set(names.filter((n, i) => names.indexOf(n) !== i))];
  if (dupNames.length) issues.push({ criterion: "variables", status: "fail", message: `Duplicate variable names: ${dupNames.join(", ")}.` });
  const unnamed = project.variables.filter((v) => !v.name.trim()).length;
  if (unnamed) issues.push({ criterion: "variables", status: "warn", message: `${unnamed} variable row(s) have no name.` });
  const used = new Set(project.hypotheses.flatMap((h) => [h.first, h.second, h.qualifier]));
  const unused = project.variables.filter((v) => v.name.trim() && !used.has(`v:${v.id}`));
  if (unused.length)
    issues.push({ criterion: "variables", status: "warn", message: `Variables not used in any hypothesis (fine for descriptive or exclusion variables): ${unused.map((v) => v.name).join(", ")}.` });
  if (!project.context.researchQuestion.trim() && project.hypotheses.length)
    issues.push({ criterion: "derivation", status: "warn", message: "No research question stated in the study context." });
  return issues;
}

export type Scorecard = {
  label: string;
  hypothesis: Hypothesis;
  results: CheckResult[];
  passed: number;
  applicable: number;
  failures: number;
};

/** Result of the authoring assessment: one scorecard per hypothesis plus project-level issues. */
export type AuthoringAssessment = { cards: Scorecard[]; issues: ProjectIssue[] };

/**
 * Authoring-time assessment of a project against the 18 criteria. For planning a study, never
 * for judging a published paper (absence in a text is not absence in the study; see the
 * experimental `evaluatePublished` for published papers).
 */
export function assessAuthoring(project: Project): AuthoringAssessment {
  const all = labelHypotheses(project.hypotheses);
  const cards = all.map((l) => {
    const results = checkHypothesis(project, l, all);
    const applicable = results.filter((x) => x.status !== "na").length;
    return {
      label: l.label,
      hypothesis: l.hypothesis,
      results,
      passed: results.filter((x) => x.status === "pass").length,
      applicable,
      failures: results.filter((x) => x.status === "fail").length,
    };
  });
  return { cards, issues: checkProject(project) };
}

/** The name Hypothesizer uses for `assessAuthoring`; identical function. */
export const scoreProject = assessAuthoring;
