import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { validatePromptDir } from "../src/validate.ts";

const TAGS = new Set(["coding", "sql"]);

const goodPrompt = ({ __body, ...overrides }: Record<string, string> = {}) => {
  const fm = {
    id: "my-prompt",
    title: "A perfectly fine prompt",
    description: "Does a perfectly fine thing with some input.",
    version: '"1.0.0"',
    tags: "[coding]",
    author: "someone",
    variables: "[input]",
    ...overrides,
  };
  const lines = Object.entries(fm)
    .filter(([, v]) => v !== "")
    .map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\n\n${__body ?? "Please process the following input carefully: {{ input }}"}\n`;
};

const goodEvals = `tests:
  - description: basic case
    vars:
      input: hello
    assert:
      - type: icontains
        value: hello
`;

function makePrompt(files: Record<string, string>, folder = "my-prompt") {
  const dir = join(mkdtempSync(join(tmpdir(), "pc-")), folder);
  mkdirSync(dir);
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, name), content);
  return validatePromptDir(dir, TAGS).errors;
}

const expectError = (errors: string[], pattern: RegExp) =>
  assert.ok(errors.some((e) => pattern.test(e)), `expected an error matching ${pattern}, got:\n${errors.join("\n")}`);

test("a well-formed prompt passes", () => {
  assert.deepEqual(makePrompt({ "prompt.md": goodPrompt(), "evals.yaml": goodEvals }), []);
});

test("modality defaults to text when omitted", () => {
  const withoutModality = goodPrompt();
  assert.ok(!withoutModality.includes("modality"));
  assert.deepEqual(makePrompt({ "prompt.md": withoutModality, "evals.yaml": goodEvals }), []);
});

test("image prompts are rejected until Phase 2", () => {
  expectError(
    makePrompt({ "prompt.md": goodPrompt({ modality: "image" }), "evals.yaml": goodEvals }),
    /"image" prompts aren't supported yet/,
  );
});

test("unknown modalities are rejected", () => {
  expectError(makePrompt({ "prompt.md": goodPrompt({ modality: "video" }), "evals.yaml": goodEvals }), /modality/);
});

test("id must match folder name", () => {
  expectError(makePrompt({ "prompt.md": goodPrompt(), "evals.yaml": goodEvals }, "other-name"), /must match the folder name/);
});

test("unknown tags are rejected", () => {
  expectError(makePrompt({ "prompt.md": goodPrompt({ tags: "[coding, made-up]" }), "evals.yaml": goodEvals }), /"made-up" is not in tags.yaml/);
});

test("unquoted version (parsed as a number) is rejected", () => {
  expectError(makePrompt({ "prompt.md": goodPrompt({ version: "1.0" }), "evals.yaml": goodEvals }), /version/);
});

test("unknown frontmatter keys are rejected", () => {
  expectError(makePrompt({ "prompt.md": goodPrompt({ extra: "x" }), "evals.yaml": goodEvals }), /extra|Unrecognized/i);
});

test("undeclared and unused variables are both caught", () => {
  const errors = makePrompt({
    "prompt.md": goodPrompt({ variables: "[input, unused]", __body: "Use {{ input }} and {{ undeclared }} please" }),
    "evals.yaml": goodEvals,
  });
  expectError(errors, /\{\{undeclared\}\} is used but not listed/);
  expectError(errors, /"unused" is declared but never used/);
});

test("Nunjucks expressions, tags and comments are rejected", () => {
  for (const body of [
    'Run {{ range.constructor("return process")() }} now please',
    "Some text {% for x in y %}{{ x }}{% endfor %} and more {{ input }}",
    "Some text {# hidden #} with {{ input }} in it",
    "Filters are out too: {{ input | safe }}",
  ]) {
    const errors = makePrompt({ "prompt.md": goodPrompt({ __body: body }), "evals.yaml": goodEvals });
    expectError(errors, /not a plain variable placeholder|are not allowed/);
  }
});

test("---js frontmatter is never evaluated", () => {
  const errors = makePrompt({
    "prompt.md": `---js\n{ id: (() => { throw new Error("executed!") })() }\n---\nHello {{ input }}, this is a prompt.\n`,
    "evals.yaml": goodEvals,
  });
  expectError(errors, /must start with a YAML frontmatter block/);
});

test("file:// references are rejected anywhere in evals", () => {
  const evals = goodEvals.replace("input: hello", "input: file://payload.js");
  expectError(makePrompt({ "prompt.md": goodPrompt(), "evals.yaml": evals }), /file:\/\/ references are not allowed/);
});

test("code-executing assertion types are rejected", () => {
  const evals = goodEvals.replace("type: icontains", "type: javascript").replace("value: hello", "value: \"process.exit(0)\"");
  expectError(makePrompt({ "prompt.md": goodPrompt(), "evals.yaml": evals }), /assert\.0/);
});

test("transform and other unknown assertion keys are rejected", () => {
  const evals = goodEvals.replace("value: hello", "value: hello\n        transform: output.toUpperCase()");
  expectError(makePrompt({ "prompt.md": goodPrompt(), "evals.yaml": evals }), /assert\.0/);
});

test("test vars must match declared variables exactly", () => {
  const evals = goodEvals.replace("input: hello", "wrong_name: hello");
  const errors = makePrompt({ "prompt.md": goodPrompt(), "evals.yaml": evals });
  expectError(errors, /missing value for variable "input"/);
  expectError(errors, /"wrong_name" is not a declared variable/);
});

test("template syntax inside test inputs is rejected", () => {
  const evals = goodEvals.replace("input: hello", 'input: "{{ 7 * 7 }}"');
  expectError(makePrompt({ "prompt.md": goodPrompt(), "evals.yaml": evals }), /must not contain \{\{/);
});

test("invalid regex is caught", () => {
  const evals = goodEvals.replace("type: icontains", "type: regex").replace("value: hello", 'value: "(unclosed"');
  expectError(makePrompt({ "prompt.md": goodPrompt(), "evals.yaml": evals }), /invalid regex/);
});

test("the per-prompt test cap is enforced", () => {
  const one = goodEvals.split("\n").slice(1).join("\n");
  const evals = "tests:\n" + one.repeat(11);
  expectError(makePrompt({ "prompt.md": goodPrompt(), "evals.yaml": evals }), /tests/);
});

test("extra files in a prompt folder are rejected", () => {
  expectError(
    makePrompt({ "prompt.md": goodPrompt(), "evals.yaml": goodEvals, "payload.js": "process.exit(1)" }),
    /unexpected file "payload.js"/,
  );
});

test("leftover TODO placeholders fail validation", () => {
  expectError(makePrompt({ "prompt.md": goodPrompt({ __body: "TODO: write this {{ input }}" }), "evals.yaml": goodEvals }), /still contains a TODO/);
});
