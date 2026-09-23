# Security policy

## Reporting a vulnerability

Please **don't open a public issue** for security problems. Report them privately through GitHub instead: **Security → Report a vulnerability** on this repo. You should hear back within a few days.

## What counts

The most important boundary in this project is the benchmark pipeline. After a merge, prompts and their evals run in a CI job that holds real LLM API keys. Please report anything that could let contributed content reach those keys or execute code in that job. For example:

- a prompt or `evals.yaml` that passes `npm run validate` but leads to code execution when evaluated (template injection, file loading, code-executing assertions, …)
- a way to get a workflow to run with secrets on untrusted code
- a way to publish something to the site's catalog without going through review

Low-risk content problems, such as a prompt that gives poor results, are fine to raise as regular issues.
