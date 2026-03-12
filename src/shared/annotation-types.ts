// ============================================
// 图像标注功能 — 类型定义
// ============================================

export interface Point2D {
  x: number
  y: number
}

export interface SplitPoint {
  id: string
  lineId: string
  /** 0~1 归一化位置，实际坐标通过线性插值计算 */
  t: number
}

export interface SubSegment {
  id: string
  lineId: string
  /** SplitPoint ID 或 'start'/'end' 表示线段端点 */
  startPointId: string
  endPointId: string
  typeId: string
}

export interface AnnotationLine {
  id: string
  start: Point2D
  end: Point2D
  color: string
  meta: Record<string, string>
  splitPoints: SplitPoint[]
  subSegments: SubSegment[]
}

export interface SubSegmentType {
  id: string
  name: string
  color: string
  /** 预设类型不可删除 */
  isPreset?: boolean
}

export type AnnotationTool = 'select' | 'draw-line' | 'add-split-point'

export const NORMAL_TYPE_ID = 'preset-normal'
export const DEFAULT_DEFECT_TYPE_ID = 'preset-burn-through'

export const DEFAULT_SUB_SEGMENT_TYPES: SubSegmentType[] = [
  { id: 'preset-normal', name: '正常', color: '#22C55E', isPreset: true },
  { id: 'preset-burn-through', name: '焊穿', color: '#EF4444', isPreset: true },
  { id: 'preset-lack-penetration', name: '未焊透', color: '#F59E0B', isPreset: true },
]

export const LINE_COLORS = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#F97316', '#14B8A6',
  '#6366F1', '#D946EF', '#0EA5E9', '#84CC16', '#F43F5E',
]

// ---------------------------------------------------------------------------
// Export JSON schema types
// ---------------------------------------------------------------------------

export interface ExportSubSegment {
  id: string
  startPointId: string
  endPointId: string
  startT: number
  endT: number
  percentageRange: string
  typeId: string
  typeName: string
  typeColor: string
}

export interface ExportLine {
  id: string
  start: Point2D
  end: Point2D
  color: string
  meta: Record<string, string>
  splitPoints: { id: string; t: number }[]
  subSegments: ExportSubSegment[]
}

export interface AnnotationExportJson {
  version: number
  exportedAt: string
  image: { path: string; width: number; height: number }
  lines: ExportLine[]
  typeDefinitions: { id: string; name: string; color: string; isPreset: boolean }[]
}
