/**
 * "Your next decisions": the open criteria of one hypothesis, turned into at most three
 * concrete questions, ranked deterministically (design review 2026-10-18):
 *
 *   tier 1  incomplete claim       (complete the prediction; which direction)
 *   tier 2  comparison/measurement (who; compared to what; how measured)
 *   tier 3  decision rules         (what counts against; smallest effect; test; definite wording)
 *   tier 4  supporting detail      (auxiliary assumptions; why; form; planned vs exploratory)
 *
 * Within a tier the order is fixed (the order of DECISIONS below), so the same project
 * always gives the same list. Criteria whose consequence is the same are merged into one
 * decision (e.g. an equivalence prediction without bounds fails "direction" and "sesoi" —
 * that is ONE "smallest effect" decision). Severity (16) is never its own decision: it is
 * satisfied by direction + bounds + counter-evidence, which already appear.
 *
 * This only re-reads the results of criteria.ts; it never changes a status, and there is
 * deliberately no score.
 */
import type { Project } from "../hypothesis/schema.js";
import { labelHypotheses } from "../hypothesis/generate.js";
import { checkHypothesis, type CheckResult, type Status } from "./criteria.js";

export type PanelId = "parts" | "population" | "comparison" | "measures" | "decide" | "bounds" | "supporting" | "why" | "organise";

export type DecisionId =
  | "complete"
  | "direction"
  | "population"
  | "comparison"
  | "measures"
  | "against"
  | "bounds"
  | "inference"
  | "definite"
  | "supporting"
  | "why"
  | "form"
  | "status";

export type Decision = {
  id: DecisionId;
  tier: 1 | 2 | 3 | 4;
  /** A question in student wording. */
  title: string;
  /** The rule-based messages behind it. */
  detail: string[];
  /** Where the field lives (a UI section id; the Hypothesizer app expands it in place). */
  panel: PanelId;
  criteria: string[];
  /** Worst underlying status. */
  status: Exclude<Status, "pass" | "na">;
};

export type SpecifiedItem = { criterion: string; label: string };

export type NextDecisions = { next: Decision[]; later: Decision[]; specified: SpecifiedItem[] };

type Rule = {
  id: DecisionId;
  tier: Decision["tier"];
  panel: PanelId;
  /** Which (criterion, status) results open this decision. */
  when: (r: CheckResult) => boolean;
};

const is = (criterion: string, ...statuses: Status[]) => (r: CheckResult) => r.criterion === criterion && statuses.includes(r.status);
const any =
  (...preds: ((r: CheckResult) => boolean)[]) =>
  (r: CheckResult) =>
    preds.some((p) => p(r));

const NOT_EQUIVALENCE = (r: CheckResult) => !/equivalence/i.test(r.message);

/** Fixed order = ranking order within a tier. */
const DECISIONS: Rule[] = [
  { id: "complete", tier: 1, panel: "parts", when: any(is("single_claim", "fail"), is("variables", "fail", "pending"), (r) => r.criterion === "direction" && r.status === "fail" && NOT_EQUIVALENCE(r)) },
  { id: "direction", tier: 1, panel: "parts", when: is("direction", "warn") },
  { id: "population", tier: 2, panel: "population", when: is("population", "warn", "fail") },
  { id: "comparison", tier: 2, panel: "comparison", when: is("comparison", "warn", "fail") },
  { id: "measures", tier: 2, panel: "measures", when: is("operationalized", "warn", "fail") },
  { id: "against", tier: 3, panel: "decide", when: is("falsification", "warn", "fail") },
  { id: "bounds", tier: 3, panel: "bounds", when: any(is("sesoi", "warn", "fail"), (r) => r.criterion === "direction" && r.status === "fail" && !NOT_EQUIVALENCE(r)) },
  { id: "inference", tier: 3, panel: "decide", when: is("inference", "warn", "fail") },
  { id: "definite", tier: 3, panel: "decide", when: is("scope", "warn", "fail") },
  { id: "supporting", tier: 4, panel: "supporting", when: is("auxiliary", "warn", "fail") },
  { id: "supporting", tier: 4, panel: "supporting", when: is("manipulation_check", "warn", "fail") },
  { id: "why", tier: 4, panel: "why", when: is("mechanism", "warn", "fail") },
  { id: "why", tier: 4, panel: "why", when: is("derivation", "warn", "fail") },
  { id: "why", tier: 4, panel: "why", when: is("theory_at_stake", "warn", "fail") },
  { id: "form", tier: 4, panel: "parts", when: is("form", "warn", "fail") },
  { id: "status", tier: 4, panel: "organise", when: is("confirmatory", "warn", "fail") },
];

const ORDER: DecisionId[] = [...new Set(DECISIONS.map((d) => d.id))];

const SEVERITY: Record<string, number> = { fail: 3, warn: 2, pending: 1 };

/** Short labels for "Already specified". */
export const SPECIFIED_LABEL: Record<string, string> = {
  variables: "What varies and what you measure",
  operationalized: "How each variable is measured",
  single_claim: "One complete prediction",
  direction: "Direction",
  comparison: "Comparison",
  form: "Shape of the relationship",
  sesoi: "Smallest effect that would matter",
  inference: "Test and threshold",
  falsification: "What would count against it",
  population: "Who it is about",
  auxiliary: "What must hold for the test to be informative",
  manipulation_check: "How you will know the manipulation worked",
  mechanism: "Mechanism",
  derivation: "Why your explanation predicts this",
  theory_at_stake: "Theory that could be shown wrong",
  severity: "Able to fail",
  confirmatory: "Planned test or exploratory",
  scope: "Decision rules worded definitely",
};

/** Criteria that only check that something is written down. */
export const PRESENCE_CRITERIA = new Set([
  "operationalized",
  "sesoi",
  "inference",
  "falsification",
  "population",
  "auxiliary",
  "manipulation_check",
  "mechanism",
  "derivation",
  "theory_at_stake",
]);

/** How a passing check is worded: "Specified" (never "pass" / a score). */
export function passWording(criterion: string): { label: string; note?: string } {
  return PRESENCE_CRITERIA.has(criterion) ? { label: "Specified", note: "Content not evaluated" } : { label: "Specified" };
}

function title(id: DecisionId, project: Project, hypothesisId: string, results: CheckResult[]): string {
  const h = project.hypotheses.find((x) => x.id === hypothesisId)!;
  switch (id) {
    case "complete":
      return "Complete the prediction: what varies, what you measure, and which way";
    case "direction":
      return "Which way do you expect the effect to go?";
    case "population":
      return "Who is this prediction about?";
    case "comparison": {
      const v = project.variables.find((x) => `v:${x.id}` === h.first);
      return v?.name.trim() ? `Compared to what? “${v.name.trim()}” is one group or condition` : "Compared to what?";
    }
    case "measures": {
      const names = [h.first, h.second, h.qualifier]
        .filter((r) => r.startsWith("v:"))
        .map((r) => project.variables.find((v) => v.id === r.slice(2)))
        .filter((v) => v && v.name.trim() && !v.operationalization.trim())
        .map((v) => v!.name.trim());
      const uniq = [...new Set(names)];
      return uniq.length ? `How will you measure or manipulate ${joinAnd(uniq.map((n) => `“${n}”`))}?` : "How will you measure or manipulate each variable?";
    }
    case "against":
      return results.some((r) => r.criterion === "falsification" && r.status === "warn" && /not significant/i.test(r.message))
        ? "“Not significant” alone cannot count against it: what result would?"
        : "What result would count against this prediction?";
    case "bounds":
      return "What is the smallest effect that would matter?";
    case "inference":
      return "How will you decide? Name the test and the threshold";
    case "definite":
      return "Word your decision rules definitely";
    case "supporting":
      return "What must hold for this test to be informative?";
    case "why":
      return "Why do you expect this?";
    case "form":
      return "What shape do you expect the relationship to have?";
    case "status":
      return "Is this a planned test or an exploratory question?";
  }
}

function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

export function nextDecisions(project: Project, hypothesisId: string, limit = 3): NextDecisions {
  const all = labelHypotheses(project.hypotheses);
  const l = all.find((x) => x.hypothesis.id === hypothesisId);
  if (!l) return { next: [], later: [], specified: [] };
  const results = checkHypothesis(project, l, all);

  const open = new Map<DecisionId, Decision>();
  for (const r of results) {
    const rule = DECISIONS.find((d) => d.when(r));
    if (!rule) continue;
    const existing = open.get(rule.id);
    const status = r.status as Decision["status"];
    if (existing) {
      if (!existing.criteria.includes(r.criterion)) existing.criteria.push(r.criterion);
      existing.detail.push(r.message);
      if (SEVERITY[status] > SEVERITY[existing.status]) existing.status = status;
    } else {
      open.set(rule.id, {
        id: rule.id,
        tier: rule.tier,
        panel: rule.panel,
        title: "",
        detail: [r.message],
        criteria: [r.criterion],
        status,
      });
    }
  }
  const ranked = [...open.values()]
    .map((d) => ({ ...d, title: title(d.id, project, hypothesisId, results) }))
    .sort((a, b) => a.tier - b.tier || ORDER.indexOf(a.id) - ORDER.indexOf(b.id));

  const specified: SpecifiedItem[] = results
    .filter((r) => r.status === "pass")
    .map((r) => ({ criterion: r.criterion, label: SPECIFIED_LABEL[r.criterion] ?? r.criterion }));

  return { next: ranked.slice(0, limit), later: ranked.slice(limit), specified };
}
