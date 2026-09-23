---
id: conventional-commit-message
title: Write a Conventional Commits message from a diff
description: Turns a git diff into a commit message following the Conventional Commits spec, including breaking-change markers when the diff changes a public API.
version: "1.0.0"
modality: text
tags: [git, coding, writing]
author: sachin-sn
variables: [diff]
---

Write a git commit message for the diff below, following the Conventional Commits 1.0.0 specification.

Rules:

- First line: `<type>(<optional scope>): <subject>`. Use one of: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
- The subject is in the imperative mood ("add", not "added"), lowercase, with no trailing period, and the whole first line is at most 72 characters.
- If the change isn't self-explanatory from the subject, add a body after one blank line explaining *why* the change was made, wrapped at 72 characters.
- If the diff changes a public API in a way that breaks existing callers, add `!` after the type/scope and a `BREAKING CHANGE:` footer describing what callers must change.
- Output only the commit message itself — no code fences, no preamble, no explanation.

Diff:

{{ diff }}
