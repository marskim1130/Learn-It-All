export interface VirtualWindowInput {
  count: number;
  scrollTop: number;
  viewportHeight: number;
  itemHeight: number;
  overscan?: number;
}

export interface VirtualWindowRange {
  startIndex: number;
  endIndex: number;
  offsetY: number;
  totalHeight: number;
}

/**
 * 计算固定行高列表的虚拟窗口 [Virtual Window]。
 * 供 TanStack Virtual 之外的纯函数测试与教学对照。
 *
 * @example
 * const range = getVirtualWindow({
 *   count: 1000,
 *   scrollTop: 400,
 *   viewportHeight: 300,
 *   itemHeight: 40,
 *   overscan: 2,
 * });
 */
export function getVirtualWindow(input: VirtualWindowInput): VirtualWindowRange {
  const overscan = input.overscan ?? 0;
  const totalHeight = input.count * input.itemHeight;

  if (input.count <= 0 || input.itemHeight <= 0) {
    return {
      startIndex: 0,
      endIndex: -1,
      offsetY: 0,
      totalHeight: 0,
    };
  }

  const rawStart = Math.floor(input.scrollTop / input.itemHeight);
  const visibleCount = Math.ceil(input.viewportHeight / input.itemHeight);
  const startIndex = Math.max(0, rawStart - overscan);
  const endIndex = Math.min(input.count - 1, rawStart + visibleCount + overscan);

  return {
    startIndex,
    endIndex,
    offsetY: startIndex * input.itemHeight,
    totalHeight,
  };
}
