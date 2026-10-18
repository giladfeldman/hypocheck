/**
 * Sources cited by the quality criteria. Every DOI here is checked against
 * Crossref by `npm run verify:citations` (scripts/verify-citations.ts): the
 * script fails if a DOI does not resolve or its registered title does not
 * contain `titleCheck`.
 */
export type Citation = {
  id: string;
  short: string;
  full: string;
  doi?: string;
  url?: string;
  /** Lower-cased fragment that must occur in the Crossref title for this DOI. */
  titleCheck?: string;
};

export const CITATIONS: Record<string, Citation> = {
  bakker2020: {
    id: "bakker2020",
    short: "Bakker et al., 2020",
    full: "Bakker, M., Veldkamp, C. L. S., van Assen, M. A. L. M., Crompvoets, E. A. V., Ong, H. H., Nosek, B. A., Soderberg, C. K., Mellor, D., & Wicherts, J. M. (2020). Ensuring the quality and specificity of preregistrations. PLOS Biology, 18(12), e3000937.",
    doi: "10.1371/journal.pbio.3000937",
    titleCheck: "ensuring the quality and specificity of preregistrations",
  },
  vandenakker2023: {
    id: "vandenakker2023",
    short: "van den Akker et al., 2023",
    full: "van den Akker, O. R., van Assen, M. A. L. M., Enting, M., de Jonge, M., Ong, H. H., Rüffer, F., Schoenmakers, M., Stoevenbelt, A. H., Wicherts, J. M., & Bakker, M. (2023). Selective hypothesis reporting in psychology: Comparing preregistrations and corresponding publications. Advances in Methods and Practices in Psychological Science, 6(3).",
    doi: "10.1177/25152459231187988",
    titleCheck: "selective hypothesis reporting",
  },
  lakens2018: {
    id: "lakens2018",
    short: "Lakens, Scheel & Isager, 2018",
    full: "Lakens, D., Scheel, A. M., & Isager, P. M. (2018). Equivalence testing for psychological research: A tutorial. Advances in Methods and Practices in Psychological Science, 1(2), 259–269.",
    doi: "10.1177/2515245918770963",
    titleCheck: "equivalence testing for psychological research",
  },
  lakensdebruine2021: {
    id: "lakensdebruine2021",
    short: "Lakens & DeBruine, 2021",
    full: "Lakens, D., & DeBruine, L. M. (2021). Improving transparency, falsifiability, and rigor by making hypothesis tests machine-readable. Advances in Methods and Practices in Psychological Science, 4(2).",
    doi: "10.1177/2515245920970949",
    titleCheck: "machine-readable",
  },
  scheel2021: {
    id: "scheel2021",
    short: "Scheel et al., 2021",
    full: "Scheel, A. M., Tiokhin, L., Isager, P. M., & Lakens, D. (2021). Why hypothesis testers should spend less time testing hypotheses. Perspectives on Psychological Science, 16(4), 744–755.",
    doi: "10.1177/1745691620966795",
    titleCheck: "why hypothesis testers should spend less time testing hypotheses",
  },
  meehl1967: {
    id: "meehl1967",
    short: "Meehl, 1967",
    full: "Meehl, P. E. (1967). Theory-testing in psychology and physics: A methodological paradox. Philosophy of Science, 34(2), 103–115.",
    doi: "10.1086/288135",
    titleCheck: "methodological paradox",
  },
  meehl1990: {
    id: "meehl1990",
    short: "Meehl, 1990",
    full: "Meehl, P. E. (1990). Appraising and amending theories: The strategy of Lakatosian defense and two principles that warrant it. Psychological Inquiry, 1(2), 108–141.",
    doi: "10.1207/s15327965pli0102_1",
    titleCheck: "lakatosian defense",
  },
  mayo2018: {
    id: "mayo2018",
    short: "Mayo, 2018",
    full: "Mayo, D. G. (2018). Statistical inference as severe testing: How to get beyond the statistics wars. Cambridge University Press.",
    doi: "10.1017/9781107286184",
    titleCheck: "severe testing",
  },
  oberauer2019: {
    id: "oberauer2019",
    short: "Oberauer & Lewandowsky, 2019",
    full: "Oberauer, K., & Lewandowsky, S. (2019). Addressing the theory crisis in psychology. Psychonomic Bulletin & Review, 26(5), 1596–1618.",
    doi: "10.3758/s13423-019-01645-2",
    titleCheck: "theory crisis",
  },
  muthukrishna2019: {
    id: "muthukrishna2019",
    short: "Muthukrishna & Henrich, 2019",
    full: "Muthukrishna, M., & Henrich, J. (2019). A problem in theory. Nature Human Behaviour, 3(3), 221–229.",
    doi: "10.1038/s41562-018-0522-1",
    titleCheck: "a problem in theory",
  },
  thompson2023: {
    id: "thompson2023",
    short: "Thompson & Skau, 2023",
    full: "Thompson, W. H., & Skau, S. (2023). On the scope of scientific hypotheses. Royal Society Open Science, 10(8), 230607.",
    doi: "10.1098/rsos.230607",
    titleCheck: "scope of scientific hypotheses",
  },
  hauser2018: {
    id: "hauser2018",
    short: "Hauser, Ellsworth & Gonzalez, 2018",
    full: "Hauser, D. J., Ellsworth, P. C., & Gonzalez, R. (2018). Are manipulation checks necessary? Frontiers in Psychology, 9, 998.",
    doi: "10.3389/fpsyg.2018.00998",
    titleCheck: "manipulation checks necessary",
  },
  lakens2022: {
    id: "lakens2022",
    short: "Lakens, 2022",
    full: "Lakens, D. (2022). Sample size justification. Collabra: Psychology, 8(1), 33267.",
    doi: "10.1525/collabra.33267",
    titleCheck: "sample size justification",
  },
  textor2017: {
    id: "textor2017",
    short: "Textor et al., 2017",
    full: "Textor, J., van der Zander, B., Gilthorpe, M. S., Liśkiewicz, M., & Ellison, G. T. H. (2017). Robust causal inference using directed acyclic graphs: The R package 'dagitty'. International Journal of Epidemiology (published online 15 January 2017).",
    doi: "10.1093/ije/dyw341",
    titleCheck: "dagitty",
  },
  borsboom2021: {
    id: "borsboom2021",
    short: "Borsboom et al., 2021",
    full: "Borsboom, D., van der Maas, H. L. J., Dalege, J., Kievit, R. A., & Haig, B. D. (2021). Theory construction methodology: A practical framework for building theories in psychology. Perspectives on Psychological Science, 16(4), 756–766.",
    doi: "10.1177/1745691620969647",
    titleCheck: "theory construction methodology",
  },
  pcirr: {
    id: "pcirr",
    short: "PCI Registered Reports",
    full: "Peer Community In Registered Reports — guide for authors (study design table).",
    url: "https://rr.peercommunityin.org/help/guide_for_authors",
  },
  popper1959: {
    id: "popper1959",
    short: "Popper, 1959",
    full: "Popper, K. R. (1959). The logic of scientific discovery. Hutchinson.",
  },
};

export function cite(...ids: string[]): Citation[] {
  return ids.map((id) => {
    const c = CITATIONS[id];
    if (!c) throw new Error(`unknown citation ${id}`);
    return c;
  });
}
