// Remove dist/ before a build so a deleted source file never survives as a stale module.
import fs from "node:fs";
fs.rmSync(new URL("../dist", import.meta.url), { recursive: true, force: true });
