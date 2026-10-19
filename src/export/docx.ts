import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  PageOrientation,
} from "docx";
import type { Project } from "../hypothesis/schema.js";
import {
  designTable,
  discussionTemplate,
  hypothesisStatements,
  labelHypotheses,
  resultsTemplate,
  summarySentence,
  variableDefinition,
  variableLists,
} from "../hypothesis/generate.js";
import { packageText, projectPackages } from "../hypothesis/package.js";

const p = (text: string, opts: { bold?: boolean } = {}) => new Paragraph({ children: [new TextRun({ text, bold: opts.bold })] });
const h = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) => new Paragraph({ text, heading: level });

const DESIGN_HEADERS = [
  "Question",
  "Hypothesis",
  "Sampling plan",
  "Analysis plan",
  "Rationale for deciding the sensitivity of the test",
  "Interpretation given different outcomes",
  "Theory that could be shown wrong by the outcomes",
];

export async function projectDocx(project: Project): Promise<Buffer> {
  const c = project.context;
  const body: (Paragraph | Table)[] = [];
  body.push(new Paragraph({ text: c.title.trim() || "Hypotheses", heading: HeadingLevel.TITLE, alignment: AlignmentType.LEFT }));
  if (c.researchQuestion.trim()) body.push(p(`Research question: ${c.researchQuestion.trim()}`));
  if (c.population.trim()) body.push(p(`Population: ${c.population.trim()}`));

  // The complete package first: prediction, measures, decision rules; open parts stay "[not specified]".
  const packages = projectPackages(project);
  if (packages.length) body.push(h("Hypotheses, ready to use", HeadingLevel.HEADING_1));
  for (const pkg of packages) {
    const [first, ...rest] = packageText(pkg).split("\n");
    body.push(p(first, { bold: true }));
    for (const line of rest) body.push(new Paragraph({ children: [new TextRun({ text: line })], indent: line.startsWith("  ") ? { left: 360 } : undefined }));
  }

  body.push(h("Hypothesis statements", HeadingLevel.HEADING_1), p(summarySentence(project)));
  for (const s of hypothesisStatements(project)) body.push(new Paragraph({ text: s, bullet: { level: 0 } }));

  body.push(h("Variables", HeadingLevel.HEADING_1));
  for (const l of variableLists(project)) if (l.names.length) body.push(p(`${l.label}: ${l.names.join(", ")}`));
  for (const v of project.variables.filter((x) => x.name.trim())) body.push(p(variableDefinition(v)));

  body.push(h("Study design table (PCI RR format)", HeadingLevel.HEADING_1));
  const rows = designTable(project);
  const mkRow = (cells: string[], bold = false) =>
    new TableRow({
      children: cells.map(
        (t) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: t, bold, size: 18 })] })] }),
      ),
    });
  body.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        mkRow(DESIGN_HEADERS, true),
        ...rows.map((r) =>
          mkRow([r.question, r.hypothesis, r.samplingPlan, r.analysisPlan, r.sensitivityRationale, r.interpretation, r.theoryAtStake]),
        ),
      ],
    }),
  );

  const labelled = labelHypotheses(project.hypotheses);
  body.push(h("Results-reporting templates", HeadingLevel.HEADING_1));
  for (const l of labelled) body.push(p(resultsTemplate(project, l)));
  body.push(h("Discussion templates", HeadingLevel.HEADING_1));
  for (const l of labelled) body.push(p(discussionTemplate(project, l)));

  const doc = new Document({
    creator: "Hypothesizer",
    title: c.title || "Hypotheses",
    sections: [{ properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } }, children: body }],
  });
  return Packer.toBuffer(doc);
}
