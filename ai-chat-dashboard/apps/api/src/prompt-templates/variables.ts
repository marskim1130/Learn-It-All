const VARIABLE_PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/**
 * 从模板正文提取双花括号变量，去重并保持首次出现顺序。
 *
 * @example
 * extractTemplateVariables("你好 {{name}}，再见 {{name}}");
 * // ["name"]
 */
export function extractTemplateVariables(body: string): string[] {
  const seen = new Set<string>();
  const variables: string[] = [];

  for (const match of body.matchAll(VARIABLE_PATTERN)) {
    const name = match[1];
    if (!name || seen.has(name)) {
      continue;
    }
    seen.add(name);
    variables.push(name);
  }

  return variables;
}

/**
 * 用变量表渲染模板正文；未提供的变量保留原占位符。
 *
 * @example
 * renderTemplate("你好 {{name}}", { name: "Alice" });
 * // "你好 Alice"
 */
export function renderTemplate(
  body: string,
  variables: Record<string, string>,
): string {
  return body.replace(VARIABLE_PATTERN, (_full, name: string) => {
    return Object.prototype.hasOwnProperty.call(variables, name)
      ? variables[name]!
      : `{{${name}}}`;
  });
}
