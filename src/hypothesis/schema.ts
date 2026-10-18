/**
 * The project data model. One Project = study context + variables + hypotheses.
 *
 * The hypothesis shape is a superset of the v0.5 spreadsheet row (theory,
 * mechanism, effect name, listing, A–association–B, qualification, kind) plus the
 * fields the quality criteria ask for (SESOI/bounds, inference criterion,
 * falsification, auxiliary assumptions, derivation, boundary conditions). The
 * structured prediction part follows the scienceverse idea (Lakens & DeBruine,
 * 2021): a hypothesis is only testable once the result that corroborates it and
 * the result that falsifies it are both written down.
 */
import { z } from "zod";

/** A reference to something a hypothesis can talk about: a variable or a named effect. */
export const RefSchema = z.string(); // "v:<variableId>" | "h:<hypothesisId>" | ""
export type Ref = z.infer<typeof RefSchema>;

export const VariableSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string().default(""),
  type: z.string().default(""),
  description: z.string().default(""),
  operationalization: z.string().default(""),
});
export type Variable = z.infer<typeof VariableSchema>;

export const EffectSizeSchema = z.object({
  metric: z.string().default(""),
  /** Smallest effect size of interest (absolute value). */
  sesoi: z.string().default(""),
  /** Four-zone bounds: the effect expected if the theory is right / the effect that would worry us. */
  optimistic: z.string().default(""),
  pessimistic: z.string().default(""),
  justification: z.string().default(""),
});

export const InferenceSchema = z.object({
  test: z.string().default(""),
  alpha: z.string().default(""),
  sided: z.enum(["", "one", "two"]).default(""),
  correction: z.string().default(""),
  bayes: z.string().default(""),
});

export const FalsificationSchema = z.object({
  supports: z.string().default(""),
  falsifies: z.string().default(""),
  inconclusive: z.string().default(""),
});

export const HypothesisSchema = z.object({
  id: z.string(),
  theory: z.string().default(""),
  mechanism: z.string().default(""),
  effectName: z.string().default(""),
  listing: z.enum(["main", "subset", "unlisted"]).default("main"),
  first: RefSchema.default(""),
  association: z.string().default(""),
  second: RefSchema.default(""),
  qualification: z.string().default(""),
  qualifier: RefSchema.default(""),
  kind: z.string().default(""),
  // ── fields beyond the v0.5 sheet ──
  derivation: z.string().default(""),
  theoryAtStake: z.string().default(""),
  population: z.string().default(""),
  /** PCI-RR "Sampling plan": power analysis / Bayes factor design analysis / sample-size justification. */
  samplingPlan: z.string().default(""),
  functionalForm: z.string().default(""),
  effectSize: EffectSizeSchema.default({ metric: "", sesoi: "", optimistic: "", pessimistic: "", justification: "" }),
  inference: InferenceSchema.default({ test: "", alpha: "", sided: "", correction: "", bayes: "" }),
  falsification: FalsificationSchema.default({ supports: "", falsifies: "", inconclusive: "" }),
  auxiliaryAssumptions: z.array(z.string()).default([]),
  notes: z.string().default(""),
});
export type Hypothesis = z.infer<typeof HypothesisSchema>;

export const StudyContextSchema = z.object({
  title: z.string().default(""),
  researchQuestion: z.string().default(""),
  phenomenon: z.string().default(""),
  population: z.string().default(""),
  discipline: z.string().default(""),
  design: z.string().default(""),
  /** Study-wide sampling plan, used when a hypothesis has none of its own. */
  samplingPlan: z.string().default(""),
  /** Optional causal graph in DAGitty syntax. */
  dag: z.string().default(""),
});
export type StudyContext = z.infer<typeof StudyContextSchema>;

export const ProjectSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  context: StudyContextSchema.default({
    title: "",
    researchQuestion: "",
    phenomenon: "",
    population: "",
    discipline: "",
    design: "",
    samplingPlan: "",
    dag: "",
  }),
  variables: z.array(VariableSchema).default([]),
  hypotheses: z.array(HypothesisSchema).default([]),
});
export type Project = z.infer<typeof ProjectSchema>;

/**
 * Makes a new id for a variable ("v") or hypothesis ("h"). Inject one (e.g. `sequentialIds()`)
 * wherever objects are created to get deterministic ids; the default is `newId`.
 */
export type IdGenerator = (prefix: string) => string;

/** Options accepted by every function that creates variables or hypotheses. */
export interface IdOptions {
  idGen?: IdGenerator;
}

let counter = 0;
/** The default id generator (time + counter + random; the format Hypothesizer projects already use). */
export function newId(prefix: string): string {
  counter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${counter}${rand}`;
}

/** A deterministic id generator: "v1", "v2", … and "h1", "h2", … (one counter per prefix). */
export function sequentialIds(start = 1): IdGenerator {
  const next = new Map<string, number>();
  return (prefix: string) => {
    const n = next.get(prefix) ?? start;
    next.set(prefix, n + 1);
    return `${prefix}${n}`;
  };
}

export function emptyProject(): Project {
  return ProjectSchema.parse({});
}

export function newVariable(partial: Partial<Variable> = {}, options: IdOptions = {}): Variable {
  return VariableSchema.parse({ id: (options.idGen ?? newId)("v"), name: "", ...partial });
}

export function newHypothesis(partial: Partial<Hypothesis> = {}, options: IdOptions = {}): Hypothesis {
  return HypothesisSchema.parse({ id: (options.idGen ?? newId)("h"), ...partial });
}
