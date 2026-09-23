/**
 * npm run prompt:new
 *
 * Interactive scaffold for a new prompt folder. Writes prompts/<id>/prompt.md
 * and prompts/<id>/evals.yaml with TODO placeholders — `npm run validate`
 * keeps failing until every TODO is replaced, so a half-finished scaffold
 * can't be merged by accident. Touches files only; never runs git.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { stringify } from "yaml";
import { LIMITS, PromptFrontmatterSchema } from "../src/schema.ts";
import { EVALS_FILE, PROMPT_FILE, loadAllowedTags } from "../src/validate.ts";

const root = process.cwd();
const rl = createInterface({ input, output });

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 64)
    .replace(/-+$/, "");

async function ask(question: string, opts: { default?: string; validate?: (v: string) => string | null } = {}) {
  for (;;) {
    const suffix = opts.default ? ` (${opts.default})` : "";
    const answer = (await rl.question(`${question}${suffix}: `)).trim() || opts.default || "";
    const problem = opts.validate?.(answer) ?? null;
    if (!problem) return answer;
    console.log(`  ✗ ${problem}`);
  }
}

const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

function gitDefaultAuthor(): string | undefined {
  try {
    return execFileSync("git", ["config", "--get", "github.user"], { encoding: "utf8" }).trim() || undefined;
  } catch {
    return undefined;
  }
}

// Validate single fields against the real schema so the CLI and CI never disagree.
const fieldCheck = (field: keyof typeof PromptFrontmatterSchema.shape) => (value: unknown) => {
  const r = PromptFrontmatterSchema.shape[field].safeParse(value);
  return r.success ? null : r.error.issues.map((i) => i.message).join("; ");
};

const allowedTags = loadAllowedTags(root);

console.log("New prompt — Ctrl+C to cancel at any point.\n");

const title = await ask("Title", { validate: (v) => fieldCheck("title")(v) });

const id = await ask("Id (folder name)", {
  default: slugify(title),
  validate: (v) =>
    fieldCheck("id")(v) ?? (existsSync(join(root, "prompts", v)) ? `prompts/${v} already exists` : null),
});

const description = await ask("One-line description", { validate: (v) => fieldCheck("description")(v) });

console.log(`\nAvailable tags: ${[...allowedTags].sort().join(", ")}`);
const tags = list(
  await ask(`Tags, comma-separated (1–${LIMITS.maxTagsPerPrompt})`, {
    validate: (v) => {
      const unknown = list(v).filter((t) => !allowedTags.has(t));
      if (unknown.length) return `not in tags.yaml: ${unknown.join(", ")} (add new tags to tags.yaml by hand)`;
      return fieldCheck("tags")(list(v));
    },
  }),
);

const variables = list(
  await ask("Input variables, comma-separated snake_case (blank for none)", {
    validate: (v) => fieldCheck("variables")(list(v)),
  }),
);

const author = await ask("Your GitHub username", {
  default: gitDefaultAuthor(),
  validate: (v) => fieldCheck("author")(v),
});

rl.close();

// ---------- write files ----------

const dir = join(root, "prompts", id);
mkdirSync(dir, { recursive: true });

const frontmatter = stringify({ id, title, description, version: "1.0.0", modality: "text", tags, author, variables }, { lineWidth: 0 });

const placeholderUse = variables.length
  ? `\n\nInputs: ${variables.map((v) => `{{ ${v} }}`).join(", ")}`
  : "";

writeFileSync(
  join(dir, PROMPT_FILE),
  `---\n${frontmatter}---\n\nTODO: write the prompt here. Reference each input with a double-brace placeholder, like the ones below.${placeholderUse}\n`,
);

const exampleTest = {
  description: "TODO: what this case checks",
  vars: Object.fromEntries(variables.map((v) => [v, "TODO"])),
  assert: [{ type: "icontains", value: "TODO" }],
};

writeFileSync(
  join(dir, EVALS_FILE),
  `# Up to ${LIMITS.maxTestsPerPrompt} tests, ${LIMITS.maxAssertionsPerTest} assertions each.
# Prefer deterministic assertions; use llm-rubric only when the output is subjective.
#
# Allowed assertion types (each also available as not-<type> except llm-rubric):
#   equals, contains, icontains, starts-with, regex        → value: string
#   contains-any, contains-all, icontains-any, icontains-all → value: [strings]
#   is-json, contains-json                                 → value: optional JSON Schema
#   llm-rubric                                             → value: what a correct answer must do
#
# Code-executing assertions, transforms, and file:// references are not allowed.
${stringify({ tests: [exampleTest] }, { lineWidth: 0 })}`,
);

console.log(`\nCreated prompts/${id}/${PROMPT_FILE} and prompts/${id}/${EVALS_FILE}`);
console.log(`Replace every TODO, then run: npm run validate -- ${id}`);
