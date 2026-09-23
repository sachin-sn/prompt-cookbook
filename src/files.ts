import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";

/**
 * YAML is parsed with the `yaml` package's default "core" schema:
 * no custom tags, no timestamp coercion, duplicate keys are errors.
 *
 * Frontmatter is split by hand instead of using gray-matter, because
 * gray-matter will happily `eval` a `---js` frontmatter block — not
 * something to allow on contributor-supplied files.
 */

export function readYamlFile(path: string): unknown {
  return parseYaml(readFileSync(path, "utf8"));
}

export interface ParsedMarkdown {
  data: unknown;
  body: string;
}

export function parseFrontmatter(source: string): ParsedMarkdown {
  const src = source.replace(/\r\n/g, "\n");
  if (!src.startsWith("---\n")) {
    throw new Error("prompt.md must start with a YAML frontmatter block (a line containing only ---)");
  }
  const end = src.indexOf("\n---\n", 4);
  const endAtEof = src.endsWith("\n---") ? src.length - 4 : -1;
  const close = end !== -1 ? end : endAtEof;
  if (close === -1) {
    throw new Error("prompt.md frontmatter is not closed (missing a second --- line)");
  }
  const data = parseYaml(src.slice(4, close));
  const body = src.slice(close + 5);
  return { data, body };
}
