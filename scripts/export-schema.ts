/**
 * Regenerates schema/*.schema.json from src/schema.ts.
 * CI fails if the committed files are out of date, so run this after
 * changing src/schema.ts and commit the result.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { CatalogSchema, EvalsFileSchema, PromptFrontmatterSchema } from "../src/schema.ts";

const outDir = join(process.cwd(), "schema");
mkdirSync(outDir, { recursive: true });

// Files people write are described as *input* (defaulted fields optional).
// catalog.json is generated, so it's described as *output*: defaults are
// always filled in, and consumers can rely on e.g. `modality` being present.
const schemas = [
  ["prompt-frontmatter", PromptFrontmatterSchema, "input"],
  ["evals", EvalsFileSchema, "input"],
  ["catalog", CatalogSchema, "output"],
] as const;

for (const [name, schema, io] of schemas) {
  const json = z.toJSONSchema(schema, { io, unrepresentable: "any" });
  const file = join(outDir, `${name}.schema.json`);
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  console.log(`wrote schema/${name}.schema.json`);
}
