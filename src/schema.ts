import { z } from "zod";

/**
 * Single source of truth for every file format in this repo.
 *
 * The JSON Schemas in /schema are generated from this file
 * (`npm run schema:export`) so that consumers outside this repo
 * (e.g. the ch-ai.in site build) can validate `catalog.json`
 * without depending on this package.
 */

// ---------- limits (the per-run budget cap) ----------

export const LIMITS = {
  maxTestsPerPrompt: 10,
  maxAssertionsPerTest: 5,
  maxTagsPerPrompt: 5,
  maxVariablesPerPrompt: 8,
} as const;

// ---------- shared primitives ----------

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "must be lowercase kebab-case (a-z, 0-9, -)")
  .max(64);

const variableName = z
  .string()
  .regex(/^[a-z_][a-z0-9_]*$/, "must be snake_case (a-z, 0-9, _), starting with a letter or _");

const semver = z
  .string()
  .regex(/^\d+\.\d+\.\d+$/, 'must be a quoted semver string like "1.0.0"');

const githubHandle = z
  .string()
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, "must be a GitHub username");

const uniqueArray = <T extends z.ZodTypeAny>(item: T) =>
  z.array(item).refine((a) => new Set(a).size === a.length, "must not contain duplicates");

// ---------- prompt.md frontmatter ----------

export const PromptFrontmatterSchema = z
  .object({
    id: slug.describe("Must match the prompt's folder name."),
    title: z.string().min(5).max(100),
    description: z.string().min(10).max(240),
    version: semver,
    tags: uniqueArray(slug).min(1).max(LIMITS.maxTagsPerPrompt),
    author: githubHandle,
    variables: uniqueArray(variableName).max(LIMITS.maxVariablesPerPrompt).default([]),
  })
  .strict();

export type PromptFrontmatter = z.infer<typeof PromptFrontmatterSchema>;

// ---------- evals.yaml ----------
//
// A deliberately small, allowlisted subset of promptfoo's assertion types.
// Anything that can execute code (javascript/python assertions, transforms,
// custom providers, file:// references) is not representable here — these
// evals run in a CI job that holds real API keys.

// Written out explicitly (rather than generated) so the types stay literal
// and TypeScript can narrow `value` from `type`.
const STRING_ASSERTIONS = [
  "equals", "contains", "icontains", "starts-with", "regex",
  "not-equals", "not-contains", "not-icontains", "not-starts-with", "not-regex",
] as const;
const LIST_ASSERTIONS = [
  "contains-any", "contains-all", "icontains-any", "icontains-all",
  "not-contains-any", "not-contains-all", "not-icontains-any", "not-icontains-all",
] as const;
const JSON_ASSERTIONS = ["is-json", "contains-json", "not-is-json", "not-contains-json"] as const;

export const ALLOWED_ASSERTION_TYPES = [
  ...STRING_ASSERTIONS, ...LIST_ASSERTIONS, ...JSON_ASSERTIONS, "llm-rubric",
] as const;

const StringAssertion = z
  .object({
    type: z.enum(STRING_ASSERTIONS),
    value: z.string().min(1),
  })
  .strict();

const ListAssertion = z
  .object({
    type: z.enum(LIST_ASSERTIONS),
    value: z.array(z.string().min(1)).min(1),
  })
  .strict();

const JsonAssertion = z
  .object({
    type: z.enum(JSON_ASSERTIONS),
    // Optional JSON Schema the parsed output must satisfy.
    value: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const RubricAssertion = z
  .object({
    type: z.literal("llm-rubric"),
    value: z.string().min(10).describe("What a correct answer must do, in plain English."),
  })
  .strict();

export const AssertionSchema = z.discriminatedUnion("type", [StringAssertion, ListAssertion, JsonAssertion, RubricAssertion]);
export type Assertion = z.infer<typeof AssertionSchema>;

export const EvalTestSchema = z
  .object({
    description: z.string().min(3).max(200),
    vars: z.record(variableName, z.string()).default({}),
    assert: z.array(AssertionSchema).min(1).max(LIMITS.maxAssertionsPerTest),
  })
  .strict();

export const EvalsFileSchema = z
  .object({
    tests: z.array(EvalTestSchema).min(1).max(LIMITS.maxTestsPerPrompt),
  })
  .strict();

export type EvalsFile = z.infer<typeof EvalsFileSchema>;

// ---------- tags.yaml ----------

export const TagsFileSchema = z
  .object({
    tags: z
      .array(z.object({ name: slug, description: z.string().min(3) }).strict())
      .min(1)
      .refine((t) => new Set(t.map((x) => x.name)).size === t.length, "duplicate tag names"),
  })
  .strict();

// ---------- models.yaml ----------

export const ModelsFileSchema = z
  .object({
    judge: z.string().min(1).describe("promptfoo provider id used to grade llm-rubric assertions"),
    models: z
      .array(
        z
          .object({
            id: z.string().min(1).describe("Stable id shown on the site, e.g. claude-sonnet-5"),
            provider: z.string().min(1).describe("promptfoo provider id"),
            label: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

// ---------- benchmark results + catalog (the contract with ch-ai.in) ----------

export const BenchmarkResultSchema = z
  .object({
    model: z.string(),
    promptVersion: semver,
    promptHash: z.string().regex(/^[a-f0-9]{64}$/, "sha256 hex"),
    passed: z.number().int().nonnegative(),
    total: z.number().int().positive(),
    runs: z.number().int().positive(),
    judge: z.string().optional(),
    ranAt: z.iso.datetime(),
  })
  .strict();

export type BenchmarkResult = z.infer<typeof BenchmarkResultSchema>;

export const CatalogEntrySchema = PromptFrontmatterSchema.extend({
  prompt: z.string().describe("The prompt text, with {{variable}} placeholders."),
  promptHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourcePath: z.string().describe("Repo-relative path, for GitHub links."),
  testCount: z.number().int().positive(),
  results: z.array(BenchmarkResultSchema),
}).strict();

export const CatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    generatedAt: z.iso.datetime(),
    prompts: z.array(CatalogEntrySchema),
  })
  .strict();

export type Catalog = z.infer<typeof CatalogSchema>;
