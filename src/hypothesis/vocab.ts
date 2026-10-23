/**
 * Controlled vocabularies. Origin: the dropdown lists of Bjørn Sætrevik's
 * Hypothesizer v0.5 spreadsheet, with its typos fixed ("exploratoy",
 * "auxiliary sumption", "moderaed", "diffrent") and the increase/increased
 * grammar split collapsed into one phrasing per association.
 */

export const VARIABLE_ROLES = [
  { id: "predictor", label: "Predictor / causal / independent variable" },
  { id: "manipulated", label: "Manipulated variable" },
  { id: "outcome", label: "Effect / outcome / dependent variable" },
  { id: "mediator", label: "Mediator" },
  { id: "moderator", label: "Moderator" },
  { id: "background", label: "Background / individual-difference variable" },
  { id: "control", label: "Control / covariate variable" },
] as const;
export type VariableRole = (typeof VARIABLE_ROLES)[number]["id"];

export const VARIABLE_TYPES = [
  {
    id: "continuous",
    label: "Continuous",
    help: "Higher values should mean 'more of' what the name says.",
  },
  {
    id: "categorical_level",
    label: "Level of a categorical variable",
    help: "Name one level (e.g. the manipulated group). Add other levels as separate rows if hypotheses compare them.",
  },
  { id: "binary", label: "Binary (yes/no)", help: "The name describes the 'yes' state." },
  { id: "ordinal", label: "Ordinal", help: "Ordered categories, e.g. education level." },
  { id: "count", label: "Count / frequency", help: "Number of events, e.g. errors per block." },
] as const;
export type VariableType = (typeof VARIABLE_TYPES)[number]["id"];

/**
 * Direction classes drive the quality checks:
 *  - positive/negative: a directional prediction
 *  - nondirectional: a difference/interaction with no sign
 *  - equivalence: a predicted absence of a meaningful effect (needs SESOI bounds)
 *  - chance: compared against a fixed chance level
 */
export type DirectionClass = "positive" | "negative" | "nondirectional" | "equivalence" | "chance";

export type Association = {
  id: string;
  label: string;
  direction: DirectionClass;
  /** Sentence fragment; {A} and {B} are replaced with variable names. */
  phrase: string;
  /** If false, the hypothesis needs only a first variable (e.g. "above chance"). */
  needsSecond: boolean;
};

export const ASSOCIATIONS: Association[] = [
  { id: "increased", label: "increased / higher", direction: "positive", phrase: "{A} will be associated with higher {B}", needsSecond: true },
  { id: "more_frequent", label: "more frequent", direction: "positive", phrase: "{A} will be associated with more frequent {B}", needsSecond: true },
  { id: "decreased", label: "decreased / lower", direction: "negative", phrase: "{A} will be associated with lower {B}", needsSecond: true },
  { id: "less_frequent", label: "less frequent", direction: "negative", phrase: "{A} will be associated with less frequent {B}", needsSecond: true },
  { id: "different", label: "be different from (no direction)", direction: "nondirectional", phrase: "{A} will be associated with a difference in {B}", needsSecond: true },
  { id: "interaction", label: "have an interaction with", direction: "nondirectional", phrase: "{A} will interact with {B}", needsSecond: true },
  { id: "moderates", label: "moderate (no direction)", direction: "nondirectional", phrase: "{A} will moderate {B}", needsSecond: true },
  // Directional moderation: B is typically a named effect ("…strengthen the Confirmation bias effect").
  { id: "strengthens", label: "strengthen (directional moderation)", direction: "positive", phrase: "{A} will strengthen {B}", needsSecond: true },
  { id: "weakens", label: "weaken (directional moderation)", direction: "negative", phrase: "{A} will weaken {B}", needsSecond: true },
  { id: "same_as", label: "be equivalent to (no meaningful difference)", direction: "equivalence", phrase: "{A} will not be associated with a meaningful difference in {B}", needsSecond: true },
  { id: "above_chance", label: "be above chance level", direction: "chance", phrase: "{A} will be above chance level", needsSecond: false },
  { id: "below_chance", label: "be below chance level", direction: "chance", phrase: "{A} will be below chance level", needsSecond: false },
];

export const QUALIFICATIONS = [
  { id: "compared_to", label: "compared to", phrase: "compared to {C}" },
  { id: "in_condition_of", label: "in the condition of", phrase: "in the condition of {C}" },
  { id: "controlling_for", label: "when controlling for", phrase: "when controlling for {C}" },
  { id: "moderated_by", label: "moderated by", phrase: "moderated by {C}" },
  { id: "mediated_by", label: "mediated by", phrase: "mediated by {C}" },
] as const;
export type QualificationId = (typeof QUALIFICATIONS)[number]["id"];

export const LISTINGS = [
  { id: "main", label: "A main hypothesis", help: "Starts a new numbered hypothesis (H1, H2, …)." },
  { id: "subset", label: "Subset of the hypothesis above", help: "Becomes H1a, H1b, … under the row above." },
  { id: "unlisted", label: "Unlisted", help: "Not numbered as a hypothesis — use for auxiliary assumptions, manipulation checks and exploratory tests." },
] as const;
export type Listing = (typeof LISTINGS)[number]["id"];

export const HYPOTHESIS_KINDS = [
  { id: "", label: "Confirmatory (not focal)" },
  { id: "focal", label: "The focal hypothesis" },
  { id: "auxiliary", label: "An auxiliary assumption" },
  { id: "manipulation_check", label: "A manipulation check" },
  { id: "exploratory", label: "Exploratory" },
] as const;
export type HypothesisKind = (typeof HYPOTHESIS_KINDS)[number]["id"];

export const FUNCTIONAL_FORMS = [
  { id: "", label: "Not specified" },
  { id: "linear", label: "Linear / monotonic" },
  { id: "threshold", label: "Threshold / step" },
  { id: "curvilinear", label: "Curvilinear (e.g. inverted U)" },
  { id: "difference", label: "Group difference" },
  { id: "interaction", label: "Interaction (effect depends on another variable)" },
  { id: "mediation", label: "Mediation (indirect effect)" },
] as const;

export const EFFECT_METRICS = [
  "Cohen's d",
  "Hedges' g",
  "r",
  "Odds ratio",
  "Risk ratio",
  "η²p (partial eta squared)",
  "Cohen's f²",
  "Raw difference (units of the measure)",
  "Proportion / percentage points",
  "Standardised β",
  "Other",
] as const;

export function associationById(id: string): Association | undefined {
  return ASSOCIATIONS.find((a) => a.id === id);
}

/** Map the v0.5 spreadsheet's free-form association strings onto our ids. */
export function associationFromLegacy(raw: string): string | undefined {
  // The newer template words its options "associated with increased" etc.
  const s = raw.trim().toLowerCase().replace(/^(will be )?associated with\s+/, "");
  if (!s) return undefined;
  // Order matters: chance and negated-difference phrases first, so "higher than chance"
  // is not read as "higher" and "not be different from" is not read as "different".
  if (/(above|higher than|more than) chance/.test(s)) return "above_chance";
  if (/(below|lower than|less than) chance/.test(s)) return "below_chance";
  if (/same as|equivalen|\b(not|no|n't)\b.*\bdif/.test(s)) return "same_as";
  if (/^(increases?|increased|higher|more than)\b/.test(s)) return "increased";
  if (/^more frequent/.test(s)) return "more_frequent";
  if (/^(decreases?|decreased|lower|less than)\b/.test(s)) return "decreased";
  if (/^less frequent/.test(s)) return "less_frequent";
  if (/interaction/.test(s)) return "interaction";
  if (/moderat|modulat/.test(s)) return "moderates";
  if (/dif/.test(s)) return "different";
  return undefined;
}

export function qualificationFromLegacy(raw: string): QualificationId | undefined {
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  if (s.startsWith("compared")) return "compared_to";
  if (s.includes("condition")) return "in_condition_of";
  if (s.includes("controlling")) return "controlling_for";
  if (/moder|modul/.test(s)) return "moderated_by";
  if (s.includes("mediat")) return "mediated_by";
  return undefined;
}

export function kindFromLegacy(raw: string): HypothesisKind {
  const s = raw.trim().toLowerCase();
  if (s.includes("not focal") || s.startsWith("confirmatory")) return "";
  if (s.includes("focal")) return "focal";
  if (s.includes("auxil")) return "auxiliary";
  if (s.includes("manipulation")) return "manipulation_check";
  if (s.includes("explor")) return "exploratory";
  return "";
}

export function listingFromLegacy(raw: string): Listing | undefined {
  const s = raw.trim().toLowerCase();
  if (s.startsWith("a main")) return "main";
  if (s.startsWith("subset")) return "subset";
  if (s.startsWith("unlisted")) return "unlisted";
  return undefined;
}

export function roleFromLegacy(raw: string): VariableRole | undefined {
  const s = raw.trim().toLowerCase();
  if (s.startsWith("predictor")) return "predictor";
  if (s.startsWith("manipulated")) return "manipulated";
  if (s.startsWith("effect") || s.includes("outcome")) return "outcome";
  if (s.startsWith("background")) return "background";
  if (s.startsWith("control")) return "control";
  if (s.startsWith("mediat")) return "mediator";
  if (s.startsWith("moderat")) return "moderator";
  return undefined;
}

export function typeFromLegacy(raw: string): VariableType | undefined {
  const s = raw.trim().toLowerCase();
  if (s.startsWith("continuous")) return "continuous";
  if (s.startsWith("categorical") || s.startsWith("level of")) return "categorical_level";
  if (s.startsWith("binary")) return "binary";
  if (s.startsWith("ordinal")) return "ordinal";
  if (s.startsWith("count")) return "count";
  return undefined;
}
