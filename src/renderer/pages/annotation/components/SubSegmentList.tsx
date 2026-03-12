import { Button } from "@/components/ui/button";
import { useAnnotationStore } from "@/stores/annotation.store";
import { getPointT, segmentLabel } from "../helpers/geometry";
import type { AnnotationLine } from "@shared/annotation-types";

interface SubSegmentListProps {
  line: AnnotationLine;
}

export function SubSegmentList({ line }: SubSegmentListProps) {
  const {
    subSegmentTypes,
    updateSubSegmentType,
    selectedSegmentId,
    selectSegment,
  } = useAnnotationStore();

  if (line.subSegments.length === 0) {
    return (
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">片段</span>
        <p className="text-xs text-muted-foreground text-center py-2">
          请先使用分割点工具在线段上添加分割点
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <span className="text-xs font-medium text-muted-foreground">
        片段 ({line.subSegments.length})
      </span>

      {line.subSegments.map((seg, idx) => {
        const startT = getPointT(seg.startPointId, line.splitPoints);
        const endT = getPointT(seg.endPointId, line.splitPoints);
        const segType = subSegmentTypes.find((t) => t.id === seg.typeId);
        const label = segmentLabel(idx);
        const isSelected = seg.id === selectedSegmentId;

        return (
          <div
            key={seg.id}
            className={`flex items-center gap-2 text-xs p-1.5 border rounded-md cursor-pointer transition-colors ${
              isSelected
                ? "border-primary bg-primary/10 ring-1 ring-primary"
                : "hover:bg-muted/30"
            }`}
            onClick={() => selectSegment(isSelected ? null : seg.id)}
          >
            {/* Color dot + label */}
            <div
              className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0 text-white font-bold"
              style={{
                backgroundColor: segType?.color || "#888",
                fontSize: 10,
              }}
            >
              {label}
            </div>

            {/* Range */}
            <span className="flex-1 truncate text-muted-foreground">
              {(Math.min(startT, endT) * 100).toFixed(0)}% -{" "}
              {(Math.max(startT, endT) * 100).toFixed(0)}%
            </span>

            {/* Type selector */}
            <select
              className="h-6 text-xs border rounded px-1 bg-background max-w-[72px]"
              value={seg.typeId}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) =>
                updateSubSegmentType(line.id, seg.id, e.target.value)
              }
            >
              {subSegmentTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}
