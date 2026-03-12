import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import type {
  Point2D,
  AnnotationLine,
  SplitPoint,
  SubSegment,
  SubSegmentType,
  AnnotationTool,
} from '@shared/annotation-types'
import { DEFAULT_SUB_SEGMENT_TYPES, LINE_COLORS, NORMAL_TYPE_ID, DEFAULT_DEFECT_TYPE_ID } from '@shared/annotation-types'
import { sortSplitPointsByT, getPointT } from '@/pages/annotation/helpers/geometry'

// ---------------------------------------------------------------------------
// History (undo/redo)
// ---------------------------------------------------------------------------

const MAX_HISTORY = 50

interface Snapshot {
  lines: AnnotationLine[]
  subSegmentTypes: SubSegmentType[]
}

function takeSnapshot(state: { lines: AnnotationLine[]; subSegmentTypes: SubSegmentType[] }): Snapshot {
  return JSON.parse(JSON.stringify({ lines: state.lines, subSegmentTypes: state.subSegmentTypes }))
}

// ---------------------------------------------------------------------------
// Sub-segment rebuild
// ---------------------------------------------------------------------------

/**
 * Rebuild sub-segments from sorted split points.
 * Smart initial type assignment:
 * - Segments touching line endpoints (start/end) → 正常 (normal)
 * - Segments between split points (middle) → defect type (焊穿)
 */
function rebuildSubSegments(
  splitPoints: SplitPoint[],
  existingSegments: SubSegment[],
  lineId: string,
): SubSegment[] {
  const sorted = sortSplitPointsByT(splitPoints)
  const anchors: { id: string }[] = [
    { id: 'start' },
    ...sorted,
    { id: 'end' },
  ]

  const newSegments: SubSegment[] = []
  for (let i = 0; i < anchors.length - 1; i++) {
    const startId = anchors[i].id
    const endId = anchors[i + 1].id

    const existing = existingSegments.find(
      (s) => s.startPointId === startId && s.endPointId === endId
    )

    if (existing) {
      newSegments.push(existing)
    } else {
      const inherited = existingSegments.find((s) => {
        return s.startPointId === startId || s.endPointId === endId
      })

      let typeId: string
      if (inherited) {
        typeId = inherited.typeId
      } else {
        const touchesEndpoint = startId === 'start' || endId === 'end'
        typeId = touchesEndpoint ? NORMAL_TYPE_ID : DEFAULT_DEFECT_TYPE_ID
      }

      newSegments.push({
        id: uuid(),
        lineId,
        startPointId: startId,
        endPointId: endId,
        typeId,
      })
    }
  }
  return newSegments
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface AnnotationState {
  imagePath: string | null
  imageDataUrl: string | null
  imageSize: { width: number; height: number } | null

  lines: AnnotationLine[]
  selectedLineId: string | null
  selectedSegmentId: string | null

  subSegmentTypes: SubSegmentType[]
  activeTool: AnnotationTool
  pendingStartPoint: Point2D | null

  stageScale: number
  stagePosition: Point2D

  // History
  _history: { past: Snapshot[]; future: Snapshot[] }

  // Image
  loadImage: (path: string, dataUrl: string, size: { width: number; height: number }) => void

  // Tool
  setTool: (tool: AnnotationTool) => void

  // Lines
  addLine: (start: Point2D, end: Point2D) => void
  selectLine: (lineId: string | null) => void
  updateLineMeta: (lineId: string, meta: Record<string, string>) => void
  updateLineColor: (lineId: string, color: string) => void
  deleteLine: (lineId: string) => void

  // Split points
  addSplitPoint: (lineId: string, t: number) => void
  removeSplitPoint: (lineId: string, pointId: string) => void

  // Sub-segments
  updateSubSegmentType: (lineId: string, subSegmentId: string, typeId: string) => void
  selectSegment: (segmentId: string | null) => void

  // Types
  addType: (name: string, color: string) => void
  updateType: (typeId: string, name: string, color: string) => void
  deleteType: (typeId: string) => void

  // Canvas
  setStageScale: (scale: number) => void
  setStagePosition: (pos: Point2D) => void
  setPendingStartPoint: (point: Point2D | null) => void

  // Undo / Redo
  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  // Export
  getExportBaseName: () => string
  buildExportJson: () => string
}

// ---------------------------------------------------------------------------
// Store implementation
// ---------------------------------------------------------------------------

export const useAnnotationStore = create<AnnotationState>((set, get) => {
  /** Push current annotation data onto the undo stack. Call BEFORE mutating. */
  function pushSnapshot() {
    const s = get()
    const snapshot = takeSnapshot(s)
    const past = [...s._history.past, snapshot]
    if (past.length > MAX_HISTORY) past.shift()
    set({ _history: { past, future: [] } })
  }

  return {
    imagePath: null,
    imageDataUrl: null,
    imageSize: null,

    lines: [],
    selectedLineId: null,
    selectedSegmentId: null,

    subSegmentTypes: [...DEFAULT_SUB_SEGMENT_TYPES],
    activeTool: 'draw-line',
    pendingStartPoint: null,

    stageScale: 1,
    stagePosition: { x: 0, y: 0 },

    _history: { past: [], future: [] },

    // ------ Image ------

    loadImage: (path, dataUrl, size) =>
      set({
        imagePath: path,
        imageDataUrl: dataUrl,
        imageSize: size,
        lines: [],
        selectedLineId: null,
        selectedSegmentId: null,
        stageScale: 1,
        stagePosition: { x: 0, y: 0 },
        _history: { past: [], future: [] },
      }),

    // ------ Tool ------

    setTool: (tool) => set({ activeTool: tool, pendingStartPoint: null }),

    // ------ Lines ------

    addLine: (start, end) => {
      pushSnapshot()
      const colorIndex = get().lines.length % LINE_COLORS.length
      const line: AnnotationLine = {
        id: uuid(),
        start,
        end,
        color: LINE_COLORS[colorIndex],
        meta: {},
        splitPoints: [],
        subSegments: [],
      }
      set((s) => ({
        lines: [...s.lines, line],
        selectedLineId: line.id,
        pendingStartPoint: null,
      }))
    },

    selectLine: (lineId) => set({ selectedLineId: lineId, selectedSegmentId: null }),

    updateLineMeta: (lineId, meta) => {
      pushSnapshot()
      set((s) => ({
        lines: s.lines.map((l) => (l.id === lineId ? { ...l, meta } : l)),
      }))
    },

    updateLineColor: (lineId, color) => {
      pushSnapshot()
      set((s) => ({
        lines: s.lines.map((l) => (l.id === lineId ? { ...l, color } : l)),
      }))
    },

    deleteLine: (lineId) => {
      pushSnapshot()
      set((s) => ({
        lines: s.lines.filter((l) => l.id !== lineId),
        selectedLineId: s.selectedLineId === lineId ? null : s.selectedLineId,
        selectedSegmentId: null,
      }))
    },

    // ------ Split points ------

    addSplitPoint: (lineId, t) => {
      pushSnapshot()
      const point: SplitPoint = { id: uuid(), lineId, t: Math.max(0, Math.min(1, t)) }
      set((s) => ({
        lines: s.lines.map((l) => {
          if (l.id !== lineId) return l
          const newSplitPoints = [...l.splitPoints, point]
          const newSubSegments = rebuildSubSegments(newSplitPoints, l.subSegments, lineId)
          return { ...l, splitPoints: newSplitPoints, subSegments: newSubSegments }
        }),
      }))
    },

    removeSplitPoint: (lineId, pointId) => {
      pushSnapshot()
      set((s) => ({
        lines: s.lines.map((l) => {
          if (l.id !== lineId) return l
          const newSplitPoints = l.splitPoints.filter((p) => p.id !== pointId)
          const newSubSegments = rebuildSubSegments(newSplitPoints, l.subSegments, lineId)
          return { ...l, splitPoints: newSplitPoints, subSegments: newSubSegments }
        }),
      }))
    },

    // ------ Sub-segments ------

    updateSubSegmentType: (lineId, subSegmentId, typeId) => {
      pushSnapshot()
      set((s) => ({
        lines: s.lines.map((l) =>
          l.id === lineId
            ? {
              ...l,
              subSegments: l.subSegments.map((seg) =>
                seg.id === subSegmentId ? { ...seg, typeId } : seg
              ),
            }
            : l
        ),
      }))
    },

    selectSegment: (segmentId) => set({ selectedSegmentId: segmentId }),

    // ------ Types ------

    addType: (name, color) => {
      pushSnapshot()
      const type: SubSegmentType = { id: uuid(), name, color }
      set((s) => ({ subSegmentTypes: [...s.subSegmentTypes, type] }))
    },

    updateType: (typeId, name, color) => {
      pushSnapshot()
      set((s) => ({
        subSegmentTypes: s.subSegmentTypes.map((t) =>
          t.id === typeId ? { ...t, name, color } : t
        ),
      }))
    },

    deleteType: (typeId) => {
      pushSnapshot()
      set((s) => ({
        subSegmentTypes: s.subSegmentTypes.filter((t) => t.id !== typeId),
      }))
    },

    // ------ Canvas ------

    setStageScale: (scale) => set({ stageScale: Math.max(0.1, Math.min(5, scale)) }),
    setStagePosition: (pos) => set({ stagePosition: pos }),
    setPendingStartPoint: (point) => set({ pendingStartPoint: point }),

    // ------ Undo / Redo ------

    undo: () => {
      const { _history, lines, subSegmentTypes } = get()
      if (_history.past.length === 0) return
      const current = takeSnapshot({ lines, subSegmentTypes })
      const past = [..._history.past]
      const snapshot = past.pop()!
      set({
        lines: snapshot.lines,
        subSegmentTypes: snapshot.subSegmentTypes,
        selectedLineId: null,
        selectedSegmentId: null,
        _history: { past, future: [..._history.future, current] },
      })
    },

    redo: () => {
      const { _history, lines, subSegmentTypes } = get()
      if (_history.future.length === 0) return
      const current = takeSnapshot({ lines, subSegmentTypes })
      const future = [..._history.future]
      const snapshot = future.pop()!
      set({
        lines: snapshot.lines,
        subSegmentTypes: snapshot.subSegmentTypes,
        selectedLineId: null,
        selectedSegmentId: null,
        _history: { past: [..._history.past, current], future },
      })
    },

    canUndo: () => get()._history.past.length > 0,
    canRedo: () => get()._history.future.length > 0,

    // ------ Export ------

    getExportBaseName: () => {
      const path = get().imagePath
      if (!path) return 'annotation'
      const name = path.replace(/\\/g, '/').split('/').pop() || 'image'
      const dotIdx = name.lastIndexOf('.')
      const base = dotIdx > 0 ? name.substring(0, dotIdx) : name
      return `${base}_annotation`
    },

    buildExportJson: () => {
      const { imagePath, imageSize, lines, subSegmentTypes } = get()

      const exportLines = lines.map((line) => {
        const exportSegments = line.subSegments.map((seg) => {
          const startT = getPointT(seg.startPointId, line.splitPoints)
          const endT = getPointT(seg.endPointId, line.splitPoints)
          const minT = Math.min(startT, endT)
          const maxT = Math.max(startT, endT)
          const segType = subSegmentTypes.find((t) => t.id === seg.typeId)
          return {
            id: seg.id,
            startPointId: seg.startPointId,
            endPointId: seg.endPointId,
            startT: minT,
            endT: maxT,
            percentageRange: `${(minT * 100).toFixed(1)}% - ${(maxT * 100).toFixed(1)}%`,
            typeId: seg.typeId,
            typeName: segType?.name || 'N/A',
            typeColor: segType?.color || '#888',
          }
        })

        return {
          id: line.id,
          start: line.start,
          end: line.end,
          color: line.color,
          meta: line.meta,
          splitPoints: line.splitPoints.map((sp) => ({ id: sp.id, t: sp.t })),
          subSegments: exportSegments,
        }
      })

      const exportObj = {
        version: 1,
        exportedAt: new Date().toISOString(),
        image: {
          path: imagePath || '',
          width: imageSize?.width || 0,
          height: imageSize?.height || 0,
        },
        lines: exportLines,
        typeDefinitions: subSegmentTypes.map((t) => ({
          id: t.id,
          name: t.name,
          color: t.color,
          isPreset: t.isPreset || false,
        })),
      }

      return JSON.stringify(exportObj, null, 2)
    },
  }
})
