# Contributing

Thanks for helping! New prompts, better evals for existing prompts, and tooling fixes are all welcome.

## Adding a prompt

1. Fork the repo and run `npm install` (Node 22+).
2. Run `npm run prompt:new` and answer the questions. It creates `prompts/<id>/prompt.md` and `prompts/<id>/evals.yaml`, both filled with `TODO` placeholders.
3. Write the prompt. Put each input where it belongs as `{{ variable_name }}`, using the variables you declared.
4. Write 3–10 test cases in `evals.yaml` (see below).
5. Run `npm run validate -- <id>` until it passes. Validation fails as long as any `TODO` is left.
6. Open a PR.

If it's your first contribution, CI waits for a maintainer to approve the run before it starts. This is normal for public repos. Every change to `main` needs a maintainer review.

Your PR doesn't need to include benchmark results. Benchmarks run after merge using the project's own API keys, so contributors never need keys or pay anything.

## Writing good evals

Evals matter as much as the prompt. A good test case checks something a **correct** answer must do. Checking only that the model produced some output is not enough.

- **Prefer deterministic assertions.** `contains`, `icontains`, `regex`, `starts-with`, `equals`, the `*-any`/`*-all` list forms, and `is-json`/`contains-json` with a JSON Schema. Each has a `not-` form as well.
- **Use `llm-rubric` only when the output is subjective**, for example "explains X and warns about Y". Say concretely what a correct answer must contain.
- **Include an edge case or a known failure mode.** These cases are where prompts actually differ.

The limits are 10 tests per prompt and 5 assertions per test.

### What isn't allowed (and why)

Benchmarks run in a CI job that holds real API keys, so anything that could execute code is rejected by the validator:

- code-executing assertion types (`javascript`, `python`, …), `transform`, and custom providers
- `file://` references anywhere in `evals.yaml`
- template logic in prompts. Only plain `{{ variable }}` placeholders are allowed: no `{% %}`, `{# #}`, filters, or expressions.
- any files in a prompt folder other than `prompt.md` and `evals.yaml`

## Text vs. image prompts

Every prompt has a `modality` field. Right now only `modality: text` is accepted.

Image-generation prompts (posters, illustrations, …) are planned. They need their own kinds of checks: image dimensions, OCR for the text in the image, and a vision-model judge. If you have one in mind, open a prompt-request issue so it's ready when support lands.

## Tags

Tags must come from `tags.yaml`. If you need a new tag, add it there with a one-line description in the same PR. The reviewer will check that it isn't a near-duplicate of an existing tag.

## Changing an existing prompt

Bump `version` in the frontmatter:

- **patch** (1.0.**1**) for a wording tweak
- **minor** (1.**1**.0) for new behavior
- **major** (**2**.0.0) if the variables or output format change

Existing scores become stale automatically and are re-run after merge.

## Tooling changes

If you change `src/schema.ts`, run `npm run schema:export` and commit the regenerated `schema/` files. CI checks that they're up to date. Run `npm run check` to run everything CI runs.
