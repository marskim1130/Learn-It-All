import { describe, expect, it } from "vitest";

import {
  extractTemplateVariables,
  renderTemplate,
} from "../src/prompt-templates/variables.js";

describe("extractTemplateVariables", () => {
  it("提取并去重双花括号变量，保持首次出现顺序", () => {
    expect(
      extractTemplateVariables("你好 {{name}}，今天聊 {{topic}}，再见 {{name}}"),
    ).toEqual(["name", "topic"]);
  });
});

describe("renderTemplate", () => {
  it("用变量值替换全部占位符", () => {
    expect(
      renderTemplate("你好 {{name}}，主题 {{topic}}", {
        name: "Alice",
        topic: "TDD",
      }),
    ).toBe("你好 Alice，主题 TDD");
  });
});
