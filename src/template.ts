/**
 * Prompts are rendered by promptfoo with Nunjucks. Nunjucks is not a
 * security sandbox (template expressions can reach JS constructors), so
 * contributor text is restricted to plain `{{ variable }}` placeholders:
 * no tags ({% %}), no comments ({# #}), no filters or expressions.
 */

const PLACEHOLDER = /\{\{([\s\S]*?)\}\}/g;
const SIMPLE_NAME = /^\s*([a-z_][a-z0-9_]*)\s*$/;

export interface TemplateScan {
  variables: Set<string>;
  errors: string[];
}

export function scanTemplate(text: string, where: string): TemplateScan {
  const variables = new Set<string>();
  const errors: string[] = [];

  if (text.includes("{%")) errors.push(`${where}: template tags "{% ... %}" are not allowed`);
  if (text.includes("{#")) errors.push(`${where}: template comments "{# ... #}" are not allowed`);

  for (const match of text.matchAll(PLACEHOLDER)) {
    const inner = match[1] ?? "";
    const name = SIMPLE_NAME.exec(inner)?.[1];
    if (name) {
      variables.add(name);
    } else {
      errors.push(
        `${where}: "{{${inner}}}" is not a plain variable placeholder — only {{ variable_name }} is allowed`,
      );
    }
  }

  // Catch unbalanced braces that would otherwise slip past the regex above.
  const withoutPlaceholders = text.replace(PLACEHOLDER, "");
  if (withoutPlaceholders.includes("{{") || withoutPlaceholders.includes("}}")) {
    errors.push(`${where}: unbalanced "{{" or "}}"`);
  }

  return { variables, errors };
}

/** Test inputs are inserted verbatim and must not contain template syntax themselves. */
export function hasTemplateSyntax(text: string): boolean {
  return /\{\{|\{%|\{#/.test(text);
}
