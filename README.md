# Prompt Cookbook

Open-source prompts that come with evidence that they work.

Every prompt in this repo ships with its own test cases. Those tests are run against several LLMs, and the pass rate is published per model. You can browse, search, and copy the prompts at **[ch-ai.in/prompt-cookbook](https://ch-ai.in/prompt-cookbook)**.

> **Status:** early. The repo structure and validation are in place. Automated benchmarking and the website are coming next. Prompts that generate images are planned. The `modality` field already exists, but only `text` prompts are accepted for now.

## What a score means

A score like `87% (26/30), 3 runs` means that across 3 runs of each test case, 26 of 30 checks passed on that model. It tells you the prompt passes **its own test cases**. It is not a universal quality rating, so a prompt with weak tests can still score high. That's why evals get the same review as the prompt itself.

Each score is tied to a hash of the prompt text. If the prompt changes, older scores are marked stale until they are re-run.

## Repo layout

```
prompts/<id>/
  prompt.md     # YAML frontmatter (title, tags, variables, …) + the prompt text
  evals.yaml    # test cases and assertions
tags.yaml       # the allowed tag vocabulary
models.yaml     # models every prompt is benchmarked against
src/schema.ts   # source of truth for every file format
schema/         # generated JSON Schemas (incl. catalog.json, consumed by the website)
```

Prompts are grouped only by tags, not by folders. A prompt can belong to several topics, and there's only one taxonomy to maintain.

## Using a prompt

Open `prompts/<id>/prompt.md`, copy everything below the frontmatter, and replace each `{{ variable }}` with your input.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The short version:

```bash
npm install
npm run prompt:new      # scaffold prompts/<id>/
npm run validate        # must pass before you open a PR
```

## License

[MIT](LICENSE)
