import { describe, expect, it } from "vitest";

import { getVirtualWindow } from "../lib/virtual-window";

describe("getVirtualWindow", () => {
  it("长列表只返回可视窗口内的索引范围", () => {
    const range = getVirtualWindow({
      count: 1000,
      scrollTop: 400,
      viewportHeight: 300,
      itemHeight: 40,
      overscan: 2,
    });

    // 400/40 = 10，ceil(300/40)=8 可见，overscan=2 → start 8，end 10+8+2=20
    expect(range.startIndex).toBe(8);
    expect(range.endIndex).toBe(20);
    expect(range.endIndex - range.startIndex + 1).toBeLessThan(30);
    expect(range.totalHeight).toBe(40_000);
  });
});
