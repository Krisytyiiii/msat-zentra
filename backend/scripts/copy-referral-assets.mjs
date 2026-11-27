import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, "src", "services", "referrals", "assets");
const dest = path.join(root, "dist", "services", "referrals", "assets");

await mkdir(dest, { recursive: true });
for (const file of ["gcform03-template.xlsx", "msat-crest.png"]) {
  await cp(path.join(src, file), path.join(dest, file));
  console.log(`[copy-referral-assets] ${file} -> dist/services/referrals/assets/`);
}
