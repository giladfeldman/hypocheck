/**
 * toPluginIssues: map an evaluation report to the SciMeto plugin issue shape.
 *
 * Mapping (0.x): NOTE → info with isFinding false; WARN → warning; never "error" (a FLAG, which
 * the rules cannot emit in 0.x, would also map to warning). OK, NOT_ASSESSABLE and not-applicable
 * results appear only in one summary item with isFinding false. One issue per concern: grouped
 * assessments (R2 + R3 on one claim) become one issue, with secondary locations in metadata.
 * Suggestions are always type "manual" with instructions — the tool never rewrites the author's text.
 */
import type { Assessment, Premise, Verdict } from "./graph.js";
import { RULE_BY_ID, type EvaluationReport, type RuleId } from "./evaluate.js";

export interface PluginIssueLocation {
  page?: number;
  paragraph?: number;
  characterStart?: number;
  characterEnd?: number;
  contextText?: string;
}

export interface PluginIssue {
  id: string;
  severity: "error" | "warning" | "info";
  isFinding?: boolean;
  category: string;
  title: string;
  description: string;
  location?: PluginIssueLocation;
  suggestion?: { type: "replace" | "delete" | "manual"; instructions?: string };
  metadata?: Record<string, unknown>;
}

export interface PluginPolicy {
  /** Lowest verdict that becomes an issue (default "NOTE"). */
  minVerdict?: "NOTE" | "WARN";
  /** Add the summary item (default true). */
  includeSummary?: boolean;
  /** Issue category (default "hypothesis-consistency"). */
  category?: string;
  /** Prefix of issue ids (default "hypocheck"). */
  idPrefix?: string;
  /** Only map assessments about this document (offsets are only meaningful for one document). */
  documentId?: string;
}

const INSTRUCTIONS: Record<RuleId, string> = {
  R1: "Check that every stated hypothesis is reported in the results under the same label, and that stated counts match the hypotheses listed.",
  R2: "If the conclusion is that there is no meaningful effect, support it with an equivalence test, an interval compared with a smallest effect of interest, or a Bayes factor; otherwise describe the result as not significant without concluding absence.",
  R3: "If the conclusion is that there is no meaningful effect, support it with an equivalence test, an interval compared with a smallest effect of interest, or a Bayes factor; otherwise describe the result as not significant without concluding absence.",
  R4: "Check the contrast coding and whether the stated test direction and the reported result match the predicted direction.",
  R5: "Report results that did not meet the stated threshold as not significant, and do not describe them as support.",
  R6: "If the claim is that the effect differs between groups, report a test of that difference (e.g. the interaction).",
  R7: "Check the difference against the preregistration and, if it is intended, disclose and justify it.",
};

const RANK: Record<Verdict, number> = { OK: 0, NOT_ASSESSABLE: 0, NOTE: 1, WARN: 2, FLAG: 3 };

function location(p: Premise | undefined): PluginIssueLocation | undefined {
  if (!p) return undefined;
  return {
    ...(p.anchor.page !== undefined ? { page: p.anchor.page } : {}),
    characterStart: p.anchor.start,
    characterEnd: p.anchor.end,
    contextText: p.anchor.exact,
  };
}

/** Map a report to plugin issues according to `policy`. Pure and deterministic. */
export function toPluginIssues(report: EvaluationReport, policy: PluginPolicy = {}): PluginIssue[] {
  const min = RANK[policy.minVerdict ?? "NOTE"];
  const category = policy.category ?? "hypothesis-consistency";
  const prefix = policy.idPrefix ?? "hypocheck";
  const inDoc = (a: Assessment) => !policy.documentId || !a.target.documentId || a.target.documentId === policy.documentId;
  const scoped = report.assessments.filter(inDoc);
  const adverse = scoped.filter((a) => a.verdict && RANK[a.verdict] >= min && (a.verdict === "NOTE" || a.verdict === "WARN" || a.verdict === "FLAG"));

  const groups = new Map<string, Assessment[]>();
  for (const a of adverse) {
    const k = a.groupId ?? a.id;
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }

  const issues: PluginIssue[] = [];
  for (const [key, members] of groups) {
    const top = members.reduce((x, y) => (RANK[y.verdict!] > RANK[x.verdict!] ? y : x));
    const ruleIds = [...new Set(members.map((m) => m.ruleId as RuleId))].sort();
    const premises = members.flatMap((m) => m.premises);
    const primary = premises.find((p) => !policy.documentId || p.anchor.documentId === policy.documentId) ?? premises[0];
    const secondary = premises
      .filter((p) => p !== primary)
      .filter((p, i, arr) => arr.findIndex((q) => q.anchor.id === p.anchor.id) === i && p.anchor.id !== primary?.anchor.id)
      .map((p) => ({ documentId: p.anchor.documentId, role: p.role, characterStart: p.anchor.start, characterEnd: p.anchor.end, contextText: p.anchor.exact }));
    const isWarn = top.verdict === "WARN" || top.verdict === "FLAG";
    const title = ruleIds.map((r) => RULE_BY_ID[r].title).join(" / ");
    issues.push({
      id: `${prefix}:${report.ruleSetVersion}:${key}`,
      severity: isWarn ? "warning" : "info",
      isFinding: isWarn,
      category,
      title,
      description: `${members.map((m) => m.explanation).join(" ")} (Automated, experimental check; not validated — review before acting.)`,
      ...(primary && (!policy.documentId || primary.anchor.documentId === policy.documentId) ? { location: location(primary) } : {}),
      suggestion: { type: "manual", instructions: INSTRUCTIONS[ruleIds[0]] },
      metadata: {
        verdict: top.verdict,
        ruleIds,
        ruleNames: ruleIds.map((r) => RULE_BY_ID[r].name),
        assessmentIds: members.map((m) => m.id),
        ruleSetVersion: report.ruleSetVersion,
        libraryVersion: report.libraryVersion,
        llmDependent: members.some((m) => m.llmDependent),
        capsApplied: [...new Set(members.flatMap((m) => m.capsApplied))],
        premises: premises.map((p) => ({ role: p.role, source: p.source, documentId: p.anchor.documentId, start: p.anchor.start, end: p.anchor.end, exact: p.anchor.exact })),
        secondaryLocations: secondary,
      },
    });
  }

  if (policy.includeSummary !== false) {
    const count = (pred: (a: Assessment) => boolean) => scoped.filter(pred).length;
    const ok = count((a) => a.verdict === "OK");
    const nas = count((a) => a.verdict === "NOT_ASSESSABLE");
    const notApp = count((a) => a.applicability === "not_applicable");
    const perRule = Object.fromEntries(
      [...new Set(scoped.map((a) => a.ruleId))].sort().map((r) => [
        r,
        {
          OK: count((a) => a.ruleId === r && a.verdict === "OK"),
          NOT_ASSESSABLE: count((a) => a.ruleId === r && a.verdict === "NOT_ASSESSABLE"),
          not_applicable: count((a) => a.ruleId === r && a.applicability === "not_applicable"),
          NOTE: count((a) => a.ruleId === r && a.verdict === "NOTE"),
          WARN: count((a) => a.ruleId === r && a.verdict === "WARN"),
        },
      ]),
    );
    issues.push({
      id: `${prefix}:${report.ruleSetVersion}:summary`,
      severity: "info",
      isFinding: false,
      category,
      title: "Hypothesis consistency checks: summary",
      description: `${issues.length} concern(s) listed. ${ok} check(s) found no concern, ${nas} could not be assessed, ${notApp} did not apply. "No concern" means only that this rule's specific problem was not found; it does not certify the hypotheses. Experimental rule set ${report.ruleSetVersion}, not validated.`,
      metadata: {
        ruleSetVersion: report.ruleSetVersion,
        libraryVersion: report.libraryVersion,
        formatVersion: report.formatVersion,
        inputHashes: report.inputHashes,
        perRule,
        notAssessable: scoped.filter((a) => a.verdict === "NOT_ASSESSABLE").map((a) => ({ ruleId: a.ruleId, target: a.target, explanation: a.explanation })),
      },
    });
  }
  return issues;
}
