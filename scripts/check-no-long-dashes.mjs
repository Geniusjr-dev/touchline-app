import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const roots = ["app", "components", "lib"];
const sourceExtensions = new Set([".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const blockedCharacters = /[\u2013\u2014]/;
const violations = [];

async function scan(target) {
  const entries = await readdir(target, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await scan(entryPath);
      continue;
    }

    if (!sourceExtensions.has(path.extname(entry.name))) continue;

    const lines = (await readFile(entryPath, "utf8")).split(/\r?\n/);
    lines.forEach((line, index) => {
      if (blockedCharacters.test(line)) {
        violations.push(`${entryPath}:${index + 1}`);
      }
    });
  }
}

for (const root of roots) {
  await scan(root);
}

if (violations.length > 0) {
  console.error("Long dash characters are not permitted in Touchline source files:");
  violations.forEach((location) => console.error(`  ${location}`));
  process.exit(1);
}

console.log("Long dash check passed.");
