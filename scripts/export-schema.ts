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

const schemas = {
  "prompt-frontmatter": PromptFrontmatterSchema,
  evals: EvalsFileSchema,
  catalog: CatalogSchema,
} as const;

for (const [name, schema] of Object.entries(schemas)) {
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" });
  const file = join(outDir, `${name}.schema.json`);
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  console.log(`wrote schema/${name}.schema.json`);
}
