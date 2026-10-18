// Check every DOI in CITATIONS against Crossref (run after `npm run build`).
// Exit 0 = all resolve and titles/years match; 1 = a mismatch; 2 = could not verify (network).
import { CITATIONS } from "../dist/index.js";
import { RULES } from "../dist/experimental/index.js";

let bad = 0;
let unverified = 0;
for (const r of RULES) for (const id of r.sources) if (!CITATIONS[id]) {
  console.log(`FAIL  rule ${r.id} cites unknown source ${id}`);
  bad++;
}
for (const c of Object.values(CITATIONS)) {
  if (!c.doi) {
    console.log(`SKIP  ${c.id} (no DOI: ${c.url ?? "book/no DOI"})`);
    continue;
  }
  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(c.doi)}`, {
      headers: { "User-Agent": "hypocheck citation check (mailto:hypocheck@invalid.example)" },
    });
    if (res.status === 404) {
      console.log(`FAIL  ${c.id} ${c.doi} — DOI not found`);
      bad++;
      continue;
    }
    if (!res.ok) {
      console.log(`UNVERIFIED ${c.id} ${c.doi} — HTTP ${res.status}`);
      unverified++;
      continue;
    }
    const m = (await res.json()).message;
    const title = (m.title?.[0] ?? "").toLowerCase().replace(/\s+/g, " ");
    const years = [m.issued, m["published-print"]].map((d) => d?.["date-parts"]?.[0]?.[0]).filter((y) => typeof y === "number");
    const ok = c.titleCheck ? title.includes(c.titleCheck) : true;
    const yearInShort = c.short.match(/\d{4}/)?.[0];
    const yearOk = !yearInShort || years.map(String).includes(yearInShort);
    console.log(`${ok && yearOk ? "OK  " : "FAIL"}  ${c.id} ${c.doi} — "${title}" (${years.join("/")})`);
    if (!ok || !yearOk) bad++;
  } catch (e) {
    console.log(`UNVERIFIED ${c.id} ${c.doi} — ${e.message}`);
    unverified++;
  }
}
console.log(`\n${bad} mismatched, ${unverified} could not be verified.`);
process.exit(bad ? 1 : unverified ? 2 : 0);
