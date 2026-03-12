import type { Point2D, SplitPoint } from '@shared/annotation-types'

/** 根据参数 t (0~1) 计算线段上的点 */
export function pointOnLine(start: Point2D, end: Point2D, t: number): Point2D {
  return {
    x: start.x + t * (end.x - start.x),
    y: start.y + t * (end.y - start.y),
  }
}

/** 计算点到线段最近投影的 t 值 (0~1 clamped) */
export function nearestTOnLine(start: Point2D, end: Point2D, point: Point2D): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return 0
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq
  return Math.max(0, Math.min(1, t))
}

/** 点到线段的距离 */
export function distanceToLine(start: Point2D, end: Point2D, point: Point2D): number {
  const t = nearestTOnLine(start, end, point)
  const proj = pointOnLine(start, end, t)
  const dx = point.x - proj.x
  const dy = point.y - proj.y
  return Math.sqrt(dx * dx + dy * dy)
}

/** 按 t 值排序分割点 */
export function sortSplitPointsByT(points: SplitPoint[]): SplitPoint[] {
  return [...points].sort((a, b) => a.t - b.t)
}

/** 获取分割点（或端点）的 t 值 */
export function getPointT(pointId: string, splitPoints: SplitPoint[]): number {
  if (pointId === 'start') return 0
  if (pointId === 'end') return 1
  const sp = splitPoints.find((p) => p.id === pointId)
  return sp ? sp.t : 0
}

/** 片段序号标签: 0->A, 1->B, ... 25->Z, 26->AA */
export function segmentLabel(index: number): string {
  let label = ''
  let n = index
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}
