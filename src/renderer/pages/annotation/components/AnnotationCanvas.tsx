import { useRef, useEffect, useState, useCallback } from "react";
import {
  Stage,
  Layer,
  Image as KonvaImage,
  Line,
  Circle,
  Text,
} from "react-konva";
import { useAnnotationStore } from "@/stores/annotation.store";
import {
  distanceToLine,
  nearestTOnLine,
  pointOnLine,
  sortSplitPointsByT,
  getPointT,
  segmentLabel,
} from "../helpers/geometry";
import type Konva from "konva";
import type { KonvaEventObject } from "konva/lib/Node";
import { NORMAL_TYPE_ID } from "@shared/annotation-types";
import React from "react";

interface AnnotationCanvasProps {
  stageRef: React.RefObject<Konva.Stage | null>;
}

export function AnnotationCanvas({ stageRef }: AnnotationCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({
    width: 800,
    height: 600,
  });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(
    null
  );
  const [spacePressed, setSpacePressed] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const {
    imageDataUrl,
    imageSize,
    lines,
    selectedLineId,
    selectedSegmentId,
    activeTool,
    pendingStartPoint,
    stageScale,
    stagePosition,
    subSegmentTypes,
    selectLine,
    selectSegment,
    addLine,
    addSplitPoint,
    deleteLine,
    setPendingStartPoint,
    setStageScale,
    setStagePosition,
    setTool,
    undo,
    redo,
  } = useAnnotationStore();

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        setContainerSize({ width, height });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Load image
  useEffect(() => {
    if (!imageDataUrl) {
      setImage(null);
      return;
    }
    const img = new window.Image();
    img.onload = () => setImage(img);
    img.onerror = () => console.error("Failed to load annotation image");
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  // Auto-fit when image first loads
  useEffect(() => {
    if (!image || !imageSize) return;
    const cw = containerSize.width;
    const ch = containerSize.height;
    if (cw <= 0 || ch <= 0) return;
    const scaleX = cw / imageSize.width;
    const scaleY = ch / imageSize.height;
    const scale = Math.min(scaleX, scaleY, 1) * 0.92;
    const x = (cw - imageSize.width * scale) / 2;
    const y = (ch - imageSize.height * scale) / 2;
    setStageScale(scale);
    setStagePosition({ x, y });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  // Keyboard: Space for pan, Backspace/Delete to delete, Ctrl+Z/Ctrl+Shift+Z for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const mod = e.metaKey || e.ctrlKey;

      // Undo: Ctrl/Cmd + Z (without Shift)
      if (mod && e.code === "KeyZ" && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      // Redo: Ctrl/Cmd + Shift + Z  or  Ctrl + Y
      if (
        (mod && e.code === "KeyZ" && e.shiftKey) ||
        (mod && e.code === "KeyY")
      ) {
        e.preventDefault();
        redo();
        return;
      }

      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setSpacePressed(true);
      }
      if ((e.code === "Backspace" || e.code === "Delete") && selectedLineId) {
        e.preventDefault();
        deleteLine(selectedLineId);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpacePressed(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [selectedLineId, deleteLine, undo, redo]);

  const getPointerPos = useCallback((): { x: number; y: number } | null => {
    const stage = stageRef.current;
    if (!stage) return null;
    const pointer = stage.getPointerPosition();
    if (!pointer) return null;
    return {
      x: (pointer.x - stagePosition.x) / stageScale,
      y: (pointer.y - stagePosition.y) / stageScale,
    };
  }, [stageRef, stagePosition, stageScale]);

  // Wheel zoom
  const handleWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const factor = 1.1;
      const newScale =
        direction > 0 ? stageScale * factor : stageScale / factor;
      const clampedScale = Math.max(0.1, Math.min(5, newScale));

      const mousePointTo = {
        x: (pointer.x - stagePosition.x) / stageScale,
        y: (pointer.y - stagePosition.y) / stageScale,
      };
      const newPos = {
        x: pointer.x - mousePointTo.x * clampedScale,
        y: pointer.y - mousePointTo.y * clampedScale,
      };

      setStageScale(clampedScale);
      setStagePosition(newPos);
    },
    [stageRef, stageScale, stagePosition, setStageScale, setStagePosition]
  );

  const handleMouseDown = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (e.evt.button === 1 || (spacePressed && e.evt.button === 0)) {
        setIsDragging(true);
        return;
      }
    },
    [spacePressed]
  );

  const handleMouseMove = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (isDragging) {
        setStagePosition({
          x: stagePosition.x + e.evt.movementX,
          y: stagePosition.y + e.evt.movementY,
        });
        return;
      }
      if (activeTool === "draw-line" && pendingStartPoint) {
        const pos = getPointerPos();
        setMousePos(pos);
      }
    },
    [
      isDragging,
      stagePosition,
      setStagePosition,
      activeTool,
      pendingStartPoint,
      getPointerPos,
    ]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleStageClick = useCallback(
    (e: KonvaEventObject<MouseEvent>) => {
      if (spacePressed || e.evt.button !== 0) return;
      const pos = getPointerPos();
      if (!pos) return;

      const HIT_THRESHOLD = 8 / stageScale;

      if (activeTool === "select") {
        // Find which line was clicked
        let clickedLineId: string | null = null;
        let clickedT: number | null = null;
        for (const line of lines) {
          const dist = distanceToLine(line.start, line.end, pos);
          if (dist < HIT_THRESHOLD) {
            clickedLineId = line.id;
            clickedT = nearestTOnLine(line.start, line.end, pos);
            break;
          }
        }

        if (
          clickedLineId &&
          clickedLineId === selectedLineId &&
          clickedT !== null
        ) {
          // Already selected line clicked again → auto add split point
          if (clickedT > 0.01 && clickedT < 0.99) {
            addSplitPoint(clickedLineId, clickedT);
          }
        } else {
          selectLine(clickedLineId);
        }
      } else if (activeTool === "draw-line") {
        // First check if clicking on an existing line → select it and switch to select mode
        let clickedLineId: string | null = null;
        for (const line of lines) {
          const dist = distanceToLine(line.start, line.end, pos);
          if (dist < HIT_THRESHOLD) {
            clickedLineId = line.id;
            break;
          }
        }
        if (clickedLineId && !pendingStartPoint) {
          // Clicked on existing line while in draw mode with no pending point → select it
          selectLine(clickedLineId);
          setTool("select");
        } else if (!pendingStartPoint) {
          setPendingStartPoint(pos);
        } else {
          addLine(pendingStartPoint, pos);
          setMousePos(null);
        }
      } else if (activeTool === "add-split-point") {
        for (const line of lines) {
          const dist = distanceToLine(line.start, line.end, pos);
          if (dist < HIT_THRESHOLD) {
            const t = nearestTOnLine(line.start, line.end, pos);
            if (t > 0.01 && t < 0.99) {
              addSplitPoint(line.id, t);
              selectLine(line.id);
            }
            break;
          }
        }
      }
    },
    [
      spacePressed,
      getPointerPos,
      stageScale,
      activeTool,
      lines,
      selectedLineId,
      selectLine,
      pendingStartPoint,
      setPendingStartPoint,
      addLine,
      addSplitPoint,
      setTool,
    ]
  );

  const cursorStyle =
    spacePressed || isDragging
      ? "grab"
      : activeTool === "draw-line" || activeTool === "add-split-point"
      ? "crosshair"
      : "default";

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-neutral-900 overflow-hidden"
      style={{ cursor: cursorStyle }}
    >
      <Stage
        ref={stageRef as React.LegacyRef<Konva.Stage>}
        width={containerSize.width}
        height={containerSize.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePosition.x}
        y={stagePosition.y}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleStageClick}
      >
        {/* Background image layer */}
        <Layer>
          {image && imageSize && (
            <KonvaImage
              image={image}
              width={imageSize.width}
              height={imageSize.height}
              listening={false}
            />
          )}
        </Layer>

        {/* Lines & annotations layer */}
        <Layer>
          {lines.map((line) => {
            const isSelected = line.id === selectedLineId;
            const sorted = sortSplitPointsByT(line.splitPoints);

            return (
              <React.Fragment key={line.id}>
                {/* Selection highlight: thick white glow */}
                {isSelected && (
                  <Line
                    points={[
                      line.start.x,
                      line.start.y,
                      line.end.x,
                      line.end.y,
                    ]}
                    stroke="#ffffff"
                    strokeWidth={8 / stageScale}
                    opacity={0.4}
                    lineCap="round"
                    listening={false}
                  />
                )}

                {/* Sub-segment overlays — color from type only */}
                {line.subSegments.map((seg, idx) => {
                  const startT = getPointT(seg.startPointId, line.splitPoints);
                  const endT = getPointT(seg.endPointId, line.splitPoints);
                  const minT = Math.min(startT, endT);
                  const maxT = Math.max(startT, endT);
                  const p1 = pointOnLine(line.start, line.end, minT);
                  const p2 = pointOnLine(line.start, line.end, maxT);
                  const segType = subSegmentTypes.find(
                    (t) => t.id === seg.typeId
                  );
                  const segColor = segType?.color || "#888";
                  const isNormal = seg.typeId === NORMAL_TYPE_ID;
                  const segOpacity = isNormal ? 0.5 : 0.9;
                  const isSegSelected = seg.id === selectedSegmentId;
                  const midT = (minT + maxT) / 2;
                  const midPt = pointOnLine(line.start, line.end, midT);
                  const label = segmentLabel(idx);

                  // Perpendicular offset for label
                  const dx = line.end.x - line.start.x;
                  const dy = line.end.y - line.start.y;
                  const len = Math.sqrt(dx * dx + dy * dy);
                  const nx = len > 0 ? -dy / len : 0;
                  const ny = len > 0 ? dx / len : 1;
                  const labelOffset = 16 / stageScale;

                  return (
                    <React.Fragment key={seg.id}>
                      {/* Segment colored line */}
                      <Line
                        points={[p1.x, p1.y, p2.x, p2.y]}
                        stroke={segColor}
                        strokeWidth={(isSegSelected ? 7 : 5) / stageScale}
                        opacity={segOpacity}
                        lineCap="round"
                        listening={false}
                      />
                      {/* Segment label badge */}
                      <Circle
                        x={midPt.x + nx * labelOffset}
                        y={midPt.y + ny * labelOffset}
                        radius={8 / stageScale}
                        fill={segColor}
                        listening={false}
                      />
                      <Text
                        x={midPt.x + nx * labelOffset - 5 / stageScale}
                        y={midPt.y + ny * labelOffset - 5 / stageScale}
                        text={label}
                        fontSize={10 / stageScale}
                        fill="#fff"
                        fontStyle="bold"
                        width={10 / stageScale}
                        align="center"
                        listening={false}
                      />
                    </React.Fragment>
                  );
                })}

                {/* Main line stroke — hidden when segments exist, kept for hit detection */}
                <Line
                  points={[line.start.x, line.start.y, line.end.x, line.end.y]}
                  stroke={
                    line.subSegments.length > 0 ? "transparent" : line.color
                  }
                  strokeWidth={(isSelected ? 3 : 2) / stageScale}
                  hitStrokeWidth={12 / stageScale}
                  lineCap="round"
                />

                {/* Selection: endpoint markers */}
                {isSelected && (
                  <>
                    <Circle
                      x={line.start.x}
                      y={line.start.y}
                      radius={4 / stageScale}
                      fill={line.color}
                      stroke="#fff"
                      strokeWidth={1.5 / stageScale}
                      listening={false}
                    />
                    <Circle
                      x={line.end.x}
                      y={line.end.y}
                      radius={4 / stageScale}
                      fill={line.color}
                      stroke="#fff"
                      strokeWidth={1.5 / stageScale}
                      listening={false}
                    />
                  </>
                )}

                {/* Split points */}
                {sorted.map((sp) => {
                  const pt = pointOnLine(line.start, line.end, sp.t);
                  return (
                    <Circle
                      key={sp.id}
                      x={pt.x}
                      y={pt.y}
                      radius={5 / stageScale}
                      fill="white"
                      stroke={line.color}
                      strokeWidth={2 / stageScale}
                    />
                  );
                })}
              </React.Fragment>
            );
          })}
        </Layer>

        {/* Drawing preview layer */}
        <Layer>
          {activeTool === "draw-line" && pendingStartPoint && mousePos && (
            <Line
              points={[
                pendingStartPoint.x,
                pendingStartPoint.y,
                mousePos.x,
                mousePos.y,
              ]}
              stroke="#fff"
              strokeWidth={1.5 / stageScale}
              dash={[6 / stageScale, 4 / stageScale]}
              listening={false}
            />
          )}
        </Layer>
      </Stage>
    </div>
  );
}
