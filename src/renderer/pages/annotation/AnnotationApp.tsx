import { useRef } from "react";
import { AnnotationToolbar } from "./components/AnnotationToolbar";
import { AnnotationCanvas } from "./components/AnnotationCanvas";
import { PropertiesPanel } from "./components/PropertiesPanel";
import type Konva from "konva";

export default function AnnotationApp() {
  const stageRef = useRef<Konva.Stage>(null);

  return (
    <div className="flex flex-col h-screen bg-background">
      <AnnotationToolbar stageRef={stageRef} />
      <div className="flex flex-1 overflow-hidden">
        <AnnotationCanvas stageRef={stageRef} />
        <PropertiesPanel />
      </div>
    </div>
  );
}
