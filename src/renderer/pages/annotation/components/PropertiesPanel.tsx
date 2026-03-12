import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAnnotationStore } from "@/stores/annotation.store";
import { MetaEditor } from "./MetaEditor";
import { SubSegmentList } from "./SubSegmentList";
import { TypeManager } from "./TypeManager";
import { LINE_COLORS } from "@shared/annotation-types";

export function PropertiesPanel() {
  const {
    imagePath,
    imageSize,
    lines,
    selectedLineId,
    updateLineMeta,
    updateLineColor,
    deleteLine,
    removeSplitPoint,
  } = useAnnotationStore();

  const selectedLine = lines.find((l) => l.id === selectedLineId);

  return (
    <div className="w-72 border-l bg-muted/10 flex flex-col overflow-y-auto flex-shrink-0">
      <div className="p-3 space-y-4">
        {/* Image info */}
        <section>
          <h3 className="text-xs font-semibold text-muted-foreground mb-2">
            图片信息
          </h3>
          {imagePath ? (
            <div className="text-xs space-y-1">
              <p className="truncate" title={imagePath}>
                {imagePath.replace(/\\/g, "/").split("/").pop()}
              </p>
              {imageSize && (
                <p className="text-muted-foreground">
                  {imageSize.width} x {imageSize.height}
                </p>
              )}
              <p className="text-muted-foreground">线段: {lines.length}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">未打开图片</p>
          )}
        </section>

        {/* Selected line properties */}
        {selectedLine && (
          <>
            <div className="w-full h-px bg-border" />
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-muted-foreground">
                  线段属性
                </h3>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive"
                  onClick={() => deleteLine(selectedLine.id)}
                  title="删除线段"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              {/* Color picker */}
              <div className="mb-3">
                <span className="text-xs text-muted-foreground">颜色</span>
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {LINE_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`w-5 h-5 rounded-full border-2 ${
                        selectedLine.color === c
                          ? "border-foreground"
                          : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                      onClick={() => updateLineColor(selectedLine.id, c)}
                    />
                  ))}
                  <input
                    type="color"
                    className="w-5 h-5 rounded border-0 cursor-pointer"
                    value={selectedLine.color}
                    onChange={(e) =>
                      updateLineColor(selectedLine.id, e.target.value)
                    }
                  />
                </div>
              </div>

              {/* Meta editor */}
              <div className="mb-3">
                <span className="text-xs text-muted-foreground">元信息</span>
                <div className="mt-1">
                  <MetaEditor
                    meta={selectedLine.meta}
                    onChange={(meta) => updateLineMeta(selectedLine.id, meta)}
                  />
                </div>
              </div>

              {/* Split points list */}
              <div className="mb-3">
                <span className="text-xs text-muted-foreground">
                  分割点 ({selectedLine.splitPoints.length})
                </span>
                {selectedLine.splitPoints.length > 0 && (
                  <div className="mt-1 space-y-1">
                    {[...selectedLine.splitPoints]
                      .sort((a, b) => a.t - b.t)
                      .map((sp, idx) => (
                        <div
                          key={sp.id}
                          className="flex items-center gap-2 text-xs"
                        >
                          <span className="w-4 text-muted-foreground text-center">
                            {idx + 1}
                          </span>
                          <div className="w-2 h-2 rounded-full bg-white border border-current" />
                          <span className="flex-1">
                            {(sp.t * 100).toFixed(1)}%
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() =>
                              removeSplitPoint(selectedLine.id, sp.id)
                            }
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Sub-segments */}
              <SubSegmentList line={selectedLine} />
            </section>
          </>
        )}

        {/* Type manager - always visible */}
        <div className="w-full h-px bg-border" />
        <TypeManager />
      </div>
    </div>
  );
}
