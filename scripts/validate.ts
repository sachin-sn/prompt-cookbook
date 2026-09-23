/**
 * npm run validate            → validate every prompt + tags.yaml + models.yaml
 * npm run validate -- <id>... → validate only the given prompts
 *
 * Needs no API keys and makes no network calls — this is what runs on every PR.
 */
import { statSync } from "node:fs";
import { join } from "node:path";
import { readYamlFile } from "../src/files.ts";
import { ModelsFileSchema } from "../src/schema.ts";
import { formatZodError, listPromptDirs, loadAllowedTags, validatePromptDir } from "../src/validate.ts";

const root = process.cwd();
const promptsRoot = join(root, "prompts");
const only = process.argv.slice(2);

let failed = 0;
const fail = (label: string, errors: string[]) => {
  failed++;
  console.error(`✗ ${label}`);
  for (const e of errors) console.error(`    ${e}`);
};

// --- repo-level config files ---
let allowedTags: Set<string>;
try {
  allowedTags = loadAllowedTags(root);
  console.log(`✓ tags.yaml (${allowedTags.size} tags)`);
} catch (e) {
  fail("tags.yaml", [(e as Error).message]);
  process.exit(1);
}

const models = ModelsFileSchema.safeParse(readYamlFile(join(root, "models.yaml")));
if (models.success) console.log(`✓ models.yaml (${models.data.models.length} models)`);
else fail("models.yaml", formatZodError("models.yaml", models.error));

// --- prompts ---
let dirs = listPromptDirs(promptsRoot);
if (only.length) {
  const wanted = new Set(only);
  dirs = dirs.filter((d) => wanted.has(d.split(/[\\/]/).pop()!));
  const found = new Set(dirs.map((d) => d.split(/[\\/]/).pop()!));
  for (const id of wanted) if (!found.has(id)) fail(id, [`no folder prompts/${id}`]);
}

for (const dir of dirs) {
  const name = dir.split(/[\\/]/).pop()!;
  if (!statSync(dir).isDirectory()) {
    fail(`prompts/${name}`, ["prompts/ may only contain one folder per prompt"]);
    continue;
  }
  const { id, errors } = validatePromptDir(dir, allowedTags);
  if (errors.length) fail(`prompts/${id}`, errors);
  else console.log(`✓ prompts/${id}`);
}

console.log("");
if (failed) {
  console.error(`${failed} item(s) failed validation.`);
  process.exit(1);
}
console.log(`All good — ${dirs.length} prompt(s) valid.`);
