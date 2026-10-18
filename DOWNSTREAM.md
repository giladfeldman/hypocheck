# Downstream — who consumes this library

**This library is not standalone infrastructure. It is part of two products.**

## Consumer: Hypothesizer web app

- **Uses:** the stable core (project model, criteria, generation, exports, AI task prompts and parsers) and, in
  time, the experimental ledger and evaluator on its extract page.
- **Reaches users through:** students and researchers writing hypotheses; the authoring checks and generated
  text appear in their projects and exported documents.
- **Compatibility promise:** projects saved with `schemaVersion: 1` keep loading; the AI prompt text stays
  byte-identical unless a release says otherwise (model-routing measurements depend on it).

## Consumer: SciMeto (planned plugin)

- **Uses (planned):** `hypocheck/experimental` — `extractLedger`, `evaluatePublished`, `toPluginIssues`.
- **Reaches users through:** observations about the author's own manuscript in a review tool.
- **Status:** experimental; first deployment private and author-facing. No verdict may be shown as an `error`
  in 0.x, and NOTE-level output is `info` with `isFinding: false`.

## Pinning

Consumers pin a **git tag**: `github:giladfeldman/hypocheck#vX.Y.Z` (the `prepare` script builds `dist/` on
install). A commit on `main` with no tag changes nothing downstream.

## What that means for a change here

The failure mode that matters is not a crash — it is a plausible, confident, wrong answer that no test catches:
a clean summary over a check that never ran, an adverse note on a correct paper, a count that is silently zero.

1. **A test watched failing against the defect first.** Break the fix and see it go red before trusting it.
2. **A failure mode the return type cannot express is a bug in the type.** "Checked, clean", "could not check"
   and "does not apply" must stay distinguishable (`OK`, `NOT_ASSESSABLE`, `not_applicable`).
3. **Every rule change is a rule-set version change** (`RULE_SET_VERSION`), even when signatures are unchanged.
4. **Before release, test the consumers**: the Hypothesizer test suite against the new build, and the planned
   plugin's mapping tests once it exists.
