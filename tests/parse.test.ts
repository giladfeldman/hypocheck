import { describe, expect, it } from "vitest";
import { parseHypothesisSentence, type ParseResult } from "../src/hypothesis/parse.js";

/** Every reported part must point at the exact characters it came from. */
function expectSpansExact(r: ParseResult) {
  for (const [, part] of Object.entries(r.parts)) {
    if (!part) continue;
    expect(r.input.slice(part.span.start, part.span.end)).toBe(part.text);
  }
}

type Want = {
  predictor?: string;
  outcome?: string;
  comparison?: string;
  population?: string;
  association?: string;
  direction?: string;
};

function expectParts(text: string, status: ParseResult["status"], want: Want) {
  const r = parseHypothesisSentence(text);
  expect(r.status, text).toBe(status);
  expectSpansExact(r);
  if ("predictor" in want) expect(r.parts.predictor?.text, `${text} → predictor`).toBe(want.predictor);
  if ("outcome" in want) expect(r.parts.outcome?.text, `${text} → outcome`).toBe(want.outcome);
  if ("comparison" in want) expect(r.parts.comparison?.text, `${text} → comparison`).toBe(want.comparison);
  if ("population" in want) expect(r.parts.population?.text, `${text} → population`).toBe(want.population);
  if ("association" in want) expect(r.parts.relationship?.association, `${text} → association`).toBe(want.association);
  if ("direction" in want) expect(r.parts.relationship?.direction, `${text} → direction`).toBe(want.direction);
  return r;
}

describe("parseHypothesisSentence — parsed (explicit direction)", () => {
  it("the sleep/exam example from the consult", () => {
    const r = expectParts("Students who sleep longer will have higher examination scores.", "parsed", {
      population: "Students",
      predictor: "sleep longer",
      outcome: "examination scores",
      association: "increased",
      direction: "positive",
      comparison: undefined,
    });
    expect(r.question).toBeUndefined();
  });

  it.each<[string, Want]>([
    ["Time pressure will be associated with higher confirmation bias.", { predictor: "Time pressure", outcome: "confirmation bias", association: "increased" }],
    ["Social media use is associated with lower wellbeing.", { predictor: "Social media use", outcome: "wellbeing", association: "decreased" }],
    ["Mindfulness training reduces stress.", { predictor: "Mindfulness training", outcome: "stress", association: "decreased" }],
    ["Exercise increases working memory capacity.", { predictor: "Exercise", outcome: "working memory capacity", association: "increased", population: undefined }],
    ["Caffeine will decrease reaction times.", { predictor: "Caffeine", outcome: "reaction times", association: "decreased" }],
    [
      "Participants in the time pressure condition will show more confirmation bias than participants in the control condition.",
      { predictor: "Participants in the time pressure condition", outcome: "confirmation bias", comparison: "participants in the control condition", association: "increased" },
    ],
    ["Women will report higher anxiety than men.", { predictor: "Women", outcome: "anxiety", comparison: "men", association: "increased" }],
    [
      "Anxiety will be higher in the threat condition compared to the safe condition.",
      { outcome: "Anxiety", predictor: "threat condition", comparison: "safe condition", association: "increased" },
    ],
    [
      "Among adolescents, social media use will be associated with lower self-esteem.",
      { population: "adolescents", predictor: "social media use", outcome: "self-esteem", association: "decreased" },
    ],
    ["There will be a positive correlation between sleep quality and mood.", { predictor: "sleep quality", outcome: "mood", association: "increased" }],
    ["There will be a negative relationship between screen time and sleep duration.", { predictor: "screen time", outcome: "sleep duration", association: "decreased" }],
    [
      "Bilinguals and monolinguals will differ in executive function.",
      { predictor: "Bilinguals", comparison: "monolinguals", outcome: "executive function", association: "different", direction: "nondirectional" },
    ],
    [
      "Bilinguals will differ from monolinguals in executive function.",
      { predictor: "Bilinguals", comparison: "monolinguals", outcome: "executive function", association: "different" },
    ],
    ["The more people sleep, the higher their exam scores.", { predictor: "people sleep", outcome: "exam scores", association: "increased" }],
    ["Higher income will be associated with lower stress.", { predictor: "income", outcome: "stress", association: "decreased" }],
    ["Higher anxiety predicts lower performance.", { predictor: "anxiety", outcome: "performance", association: "decreased" }],
    ["Depression is negatively correlated with sleep quality.", { predictor: "Depression", outcome: "sleep quality", association: "decreased" }],
    ["Lower self-control will lead to more aggression.", { predictor: "self-control", outcome: "aggression", association: "decreased" }],
    ["We hypothesize that gratitude journaling will increase life satisfaction.", { predictor: "gratitude journaling", outcome: "life satisfaction", association: "increased" }],
    ["H1: Loneliness will be positively associated with depression.", { predictor: "Loneliness", outcome: "depression", association: "increased" }],
    [
      "Older adults will show lower memory performance than younger adults.",
      { predictor: "Older adults", outcome: "memory performance", comparison: "younger adults", association: "decreased" },
    ],
    [
      "Reading fluency will be higher among children who were read to daily.",
      { outcome: "Reading fluency", predictor: "children who were read to daily", association: "increased" },
    ],
    [
      "Students with a growth mindset will have higher grades compared to students with a fixed mindset.",
      { population: "Students", predictor: "growth mindset", outcome: "grades", comparison: "students with a fixed mindset", association: "increased" },
    ],
    [
      "Among Austrian undergraduates, daily exercise will be associated with higher exam scores compared to no exercise.",
      { population: "Austrian undergraduates", predictor: "daily exercise", outcome: "exam scores", comparison: "no exercise", association: "increased" },
    ],
    [
      // the "I have a question" scaffold produces this shape
      "Among first-year students, exam scores will be higher when sleep duration is longer.",
      { population: "first-year students", outcome: "exam scores", predictor: "sleep duration is longer", association: "increased" },
    ],
    [
      "Men and women will not differ in mathematical ability.",
      { predictor: "Men", comparison: "women", outcome: "mathematical ability", association: "same_as", direction: "equivalence" },
    ],
    [
      "There will be no difference in recall between spaced practice and massed practice.",
      { outcome: "recall", predictor: "spaced practice", comparison: "massed practice", association: "same_as" },
    ],
  ])("%s", (text, want) => {
    expectParts(text, "parsed", want);
  });

  it("keeps hedged wording parseable but notes the hedge", () => {
    const r = expectParts("Sleep may increase exam scores.", "parsed", { predictor: "Sleep", outcome: "exam scores", association: "increased" });
    expect(r.notes.join(" ")).toMatch(/may/);
  });
});

describe("parseHypothesisSentence — ambiguous (one concrete question)", () => {
  it.each<[string, Want]>([
    ["Sleep affects exam performance.", { predictor: "Sleep", outcome: "exam performance" }],
    ["Mindfulness will influence stress.", { predictor: "Mindfulness", outcome: "stress" }],
    ["Sleep quality is related to mood.", { predictor: "Sleep quality", outcome: "mood" }],
    ["Caffeine predicts alertness.", { predictor: "Caffeine", outcome: "alertness" }],
    ["Time pressure will be associated with confirmation bias.", { predictor: "Time pressure", outcome: "confirmation bias" }],
    ["There will be a correlation between sleep and mood.", { predictor: "sleep", outcome: "mood" }],
  ])("direction left unspecified: %s", (text, want) => {
    const r = expectParts(text, "ambiguous", { ...want, association: "", direction: "unspecified" });
    expect(r.question?.text).toBeTruthy();
    const ids = r.question!.options.map((o) => o.association);
    expect(ids).toEqual(["increased", "decreased", "different"]);
    expect(r.alternatives.map((a) => a.association)).toEqual(["increased", "decreased", "different"]);
  });

  it("'improve' asks what better means instead of guessing", () => {
    const r = expectParts("Exercise will improve cognitive performance.", "ambiguous", {
      predictor: "Exercise",
      outcome: "cognitive performance",
      association: "",
    });
    expect(r.question?.text).toMatch(/improve/);
    expect(r.question?.options.map((o) => o.association)).toEqual(["increased", "decreased", null]);
  });

  it("'better grades' with a who-clause asks too", () => {
    const r = expectParts("Students who sleep more will have better grades.", "ambiguous", {
      population: "Students",
      predictor: "sleep more",
      outcome: "grades",
      association: "",
    });
    expect(r.question?.text).toMatch(/better/);
  });

  it("a leading 'lower' flips what the answer buttons mean", () => {
    const r = parseHypothesisSentence("Lower self-control will affect aggression.");
    expect(r.status).toBe("ambiguous");
    expect(r.parts.predictor?.text).toBe("self-control");
    // "Higher aggression" given LOWER self-control is a negative association with self-control.
    expect(r.question?.options[0].association).toBe("decreased");
    expect(r.question?.options[1].association).toBe("increased");
  });
});

describe("parseHypothesisSentence — unsupported (hard negatives, never invent)", () => {
  it.each<[string, string]>([
    ["", "empty"],
    ["   ", "empty"],
    ["Does sleep affect exam performance?", "question"],
    ["Sleep is important for students.", "no_pattern"],
    ["We will explore the relationship between sleep and grades.", "no_pattern"],
    ["Exercise will increase memory and decrease anxiety.", "compound"],
    ["Sleep will be associated with higher exam scores and lower anxiety.", "compound"],
    ["Caffeine will not increase alertness.", "negated"],
    ["The effect of stress on memory will be stronger in older adults.", "moderation"],
    ["If people are tired, then they make more errors.", "no_pattern"],
    ["Sleep.", "no_pattern"],
    ["Students will do better.", "no_pattern"],
    [
      "Participants who have been exposed to the experimental manipulation involving a long and complicated set of instructions about the task will have higher scores.",
      "too_long",
    ],
  ])("%s → %s", (text, reason) => {
    const r = parseHypothesisSentence(text);
    expect(r.status).toBe("unsupported");
    expect(r.reason).toBe(reason);
    expect(r.parts).toEqual({});
    expect(r.question).toBeUndefined();
  });

  it("never invents a population or comparison", () => {
    const r = parseHypothesisSentence("Exercise increases working memory capacity.");
    expect(r.parts.population).toBeUndefined();
    expect(r.parts.comparison).toBeUndefined();
  });

  it("is pure: the same input gives the same output", () => {
    const a = parseHypothesisSentence("Students who sleep longer will have higher examination scores.");
    const b = parseHypothesisSentence("Students who sleep longer will have higher examination scores.");
    expect(a).toEqual(b);
  });
});
