---
id: extract-contact-json
title: Extract contact details as JSON
description: Pulls a person's name, email, phone, and company out of free text into a fixed JSON shape, using null for anything not present instead of guessing.
version: "1.0.0"
tags: [extraction, json]
author: sachin-sn
variables: [text]
---

Extract contact details for the person who wrote or is described in the text below.

Return a single JSON object with exactly these keys:

- `name` — the person's full name as written
- `email` — their email address
- `phone` — their phone number exactly as written
- `company` — the organization they work for

Use `null` for any field that is not explicitly present in the text. Never guess, infer, or invent a value.

Output only the JSON object — no code fences, no explanation.

Text:

{{ text }}
