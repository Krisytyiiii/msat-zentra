import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, "src", "services", "sf10", "assets");
const dest = path.join(root, "dist", "services", "sf10", "assets");

await mkdir(dest, { recursive: true });
for (const file of ["sf10-template.xlsx", "sf10-template-shs.xlsx"]) {
  await cp(path.join(src, file), path.join(dest, file));
  console.log(`[copy-sf10-assets] ${file} -> dist/services/sf10/assets/`);
}
