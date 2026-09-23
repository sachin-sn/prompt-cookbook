import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { z } from "zod";
import { parseFrontmatter, readYamlFile } from "./files.ts";
import { EvalsFileSchema, PromptFrontmatterSchema, SUPPORTED_MODALITIES, TagsFileSchema } from "./schema.ts";
import { hasTemplateSyntax, scanTemplate } from "./template.ts";

export const PROMPT_FILE = "prompt.md";
export const EVALS_FILE = "evals.yaml";
const ALLOWED_FILES = new Set([PROMPT_FILE, EVALS_FILE]);

export interface ValidationResult {
  id: string;
  errors: string[];
}

export function formatZodError(file: string, error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "(root)";
    return `${file} → ${path}: ${issue.message}`;
  });
}

export function loadAllowedTags(root: string): Set<string> {
  const parsed = TagsFileSchema.safeParse(readYamlFile(join(root, "tags.yaml")));
  if (!parsed.success) {
    throw new Error(formatZodError("tags.yaml", parsed.error).join("\n"));
  }
  return new Set(parsed.data.tags.map((t) => t.name));
}

/** Recursively collect every string in a parsed YAML value, with its path. */
function* walkStrings(value: unknown, path: string): Generator<[string, string]> {
  if (typeof value === "string") {
    yield [path, value];
  } else if (Array.isArray(value)) {
    for (const [i, v] of value.entries()) yield* walkStrings(v, `${path}[${i}]`);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      yield* walkStrings(k, `${path}.<key>`);
      yield* walkStrings(v, path ? `${path}.${k}` : k);
    }
  }
}

function checkRawText(file: string, text: string, errors: string[]) {
  if (/\bTODO\b/.test(text)) errors.push(`${file}: still contains a TODO placeholder`);
}

export function validatePromptDir(dir: string, allowedTags: Set<string>): ValidationResult {
  const folder = basename(dir);
  const errors: string[] = [];
  const result = { id: folder, errors };

  // --- files present in the folder ---
  for (const entry of readdirSync(dir)) {
    if (!ALLOWED_FILES.has(entry) || statSync(join(dir, entry)).isDirectory()) {
      errors.push(`unexpected file "${entry}" — a prompt folder may only contain ${[...ALLOWED_FILES].join(" and ")}`);
    }
  }
  const promptPath = join(dir, PROMPT_FILE);
  const evalsPath = join(dir, EVALS_FILE);
  if (!existsSync(promptPath)) errors.push(`missing ${PROMPT_FILE}`);
  if (!existsSync(evalsPath)) errors.push(`missing ${EVALS_FILE}`);
  if (errors.length) return result;

  // --- prompt.md ---
  const promptSource = readFileSync(promptPath, "utf8");
  checkRawText(PROMPT_FILE, promptSource, errors);

  let parsedMd;
  try {
    parsedMd = parseFrontmatter(promptSource);
  } catch (e) {
    errors.push(`${PROMPT_FILE}: ${(e as Error).message}`);
    return result;
  }

  const fm = PromptFrontmatterSchema.safeParse(parsedMd.data);
  if (!fm.success) {
    errors.push(...formatZodError(PROMPT_FILE, fm.error));
    return result;
  }
  const frontmatter = fm.data;

  if (frontmatter.id !== folder) {
    errors.push(`${PROMPT_FILE} → id: "${frontmatter.id}" must match the folder name "${folder}"`);
  }
  if (!SUPPORTED_MODALITIES.has(frontmatter.modality)) {
    errors.push(
      `${PROMPT_FILE} → modality: "${frontmatter.modality}" prompts aren't supported yet — only "text" can be validated and benchmarked for now`,
    );
    return result;
  }
  for (const tag of frontmatter.tags) {
    if (!allowedTags.has(tag)) {
      errors.push(`${PROMPT_FILE} → tags: "${tag}" is not in tags.yaml (add it there in the same PR if it's genuinely new)`);
    }
  }

  const body = parsedMd.body.trim();
  if (body.length < 20) errors.push(`${PROMPT_FILE}: prompt text is missing or too short`);
  if (body.length > 20_000) errors.push(`${PROMPT_FILE}: prompt text is over 20,000 characters`);

  const declared = new Set(frontmatter.variables);
  const bodyScan = scanTemplate(body, `${PROMPT_FILE} body`);
  errors.push(...bodyScan.errors);
  for (const v of bodyScan.variables) {
    if (!declared.has(v)) errors.push(`${PROMPT_FILE}: {{${v}}} is used but not listed in "variables"`);
  }
  for (const v of declared) {
    if (!bodyScan.variables.has(v)) errors.push(`${PROMPT_FILE}: variable "${v}" is declared but never used in the prompt`);
  }

  // --- evals.yaml ---
  const evalsSource = readFileSync(evalsPath, "utf8");
  checkRawText(EVALS_FILE, evalsSource, errors);

  let evalsRaw: unknown;
  try {
    evalsRaw = readYamlFile(evalsPath);
  } catch (e) {
    errors.push(`${EVALS_FILE}: invalid YAML — ${(e as Error).message}`);
    return result;
  }

  // Reject file:// anywhere, before schema parsing — promptfoo would load
  // (and for .js/.py, execute) the referenced file.
  for (const [path, s] of walkStrings(evalsRaw, "")) {
    if (/^\s*file:\/\//i.test(s)) errors.push(`${EVALS_FILE} → ${path}: file:// references are not allowed`);
  }

  const ev = EvalsFileSchema.safeParse(evalsRaw);
  if (!ev.success) {
    errors.push(...formatZodError(EVALS_FILE, ev.error));
    return result;
  }

  ev.data.tests.forEach((test, i) => {
    const where = `${EVALS_FILE} → tests[${i}] ("${test.description}")`;

    const given = new Set(Object.keys(test.vars));
    for (const v of declared) if (!given.has(v)) errors.push(`${where}: missing value for variable "${v}"`);
    for (const v of given) if (!declared.has(v)) errors.push(`${where}: "${v}" is not a declared variable`);
    for (const [k, value] of Object.entries(test.vars)) {
      if (hasTemplateSyntax(value)) errors.push(`${where} → vars.${k}: must not contain {{, {% or {#`);
    }

    test.assert.forEach((a, j) => {
      const aw = `${where} → assert[${j}]`;
      if ((a.type === "regex" || a.type === "not-regex") && typeof a.value === "string") {
        try {
          new RegExp(a.value);
        } catch (e) {
          errors.push(`${aw}: invalid regex — ${(e as Error).message}`);
        }
      }
      if (a.type === "llm-rubric") {
        const scan = scanTemplate(a.value, aw);
        errors.push(...scan.errors);
        for (const v of scan.variables) {
          if (!declared.has(v)) errors.push(`${aw}: {{${v}}} is not a declared variable`);
        }
      }
    });
  });

  return result;
}

export function listPromptDirs(promptsRoot: string): string[] {
  if (!existsSync(promptsRoot)) return [];
  return readdirSync(promptsRoot)
    .filter((name) => !name.startsWith("."))
    .map((name) => join(promptsRoot, name))
    .sort();
}
