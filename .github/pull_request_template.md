## What does this PR do?

<!-- New prompt / improved prompt / new evals / tooling change -->

## For new or changed prompts

- [ ] `npm run validate` passes locally
- [ ] Every test case checks something a *correct* answer must do — not just that the model responded
- [ ] Deterministic assertions (`contains`, `regex`, `is-json`, …) are used wherever possible; `llm-rubric` only for genuinely subjective output
- [ ] At least one test covers an edge case or a known way the task goes wrong
- [ ] For a changed prompt: `version` is bumped (patch = wording tweak, minor = new behavior, major = changed variables or output format)
- [ ] I wrote this prompt myself or have the right to contribute it under this repo's license

## Anything reviewers should know?
