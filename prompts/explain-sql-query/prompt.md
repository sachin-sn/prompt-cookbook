---
id: explain-sql-query
title: Explain a SQL query in plain English
description: Walks through what a SQL query returns, clause by clause in logical evaluation order, and flags gotchas like NULL handling and join duplication.
version: "1.0.0"
tags: [sql, explanation, coding]
author: sachin-sn
variables: [query]
---

You are a senior data engineer explaining SQL to a colleague who knows basic SQL but hasn't seen this query before.

Explain what the SQL query below does, in plain English. Structure your answer with these three headings:

1. **Summary** — one or two sentences on what result the query returns.
2. **Step by step** — how the query produces that result, in the order the database logically evaluates it (FROM/JOIN, WHERE, GROUP BY, HAVING, SELECT, ORDER BY, LIMIT). Skip clauses the query doesn't use.
3. **Gotchas** — anything surprising or easy to get wrong: NULL handling, duplicate rows from joins, non-deterministic ordering, implicit type casts, or obvious performance problems. Write "None" if there aren't any.

Do not rewrite or "improve" the query unless it contains an outright error.

SQL query:

```sql
{{ query }}
```
