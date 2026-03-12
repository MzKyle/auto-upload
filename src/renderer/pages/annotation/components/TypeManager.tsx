import { useState } from "react";
import { Plus, Trash2, Edit2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAnnotationStore } from "@/stores/annotation.store";

export function TypeManager() {
  const { subSegmentTypes, addType, updateType, deleteType } =
    useAnnotationStore();
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366F1");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  const handleAdd = () => {
    if (!newName.trim()) return;
    addType(newName.trim(), newColor);
    setNewName("");
    setNewColor("#6366F1");
    setIsAdding(false);
  };

  const startEdit = (id: string, name: string, color: string) => {
    setEditingId(id);
    setEditName(name);
    setEditColor(color);
  };

  const confirmEdit = () => {
    if (editingId && editName.trim()) {
      updateType(editingId, editName.trim(), editColor);
    }
    setEditingId(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          标注类型
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs"
          onClick={() => setIsAdding(!isAdding)}
        >
          {isAdding ? (
            "取消"
          ) : (
            <>
              <Plus className="h-3 w-3 mr-1" />
              添加
            </>
          )}
        </Button>
      </div>

      {isAdding && (
        <div className="flex items-center gap-1 p-2 border rounded-md bg-muted/20">
          <input
            type="color"
            className="w-7 h-7 rounded border-0 cursor-pointer"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
          />
          <Input
            className="h-7 text-xs flex-1"
            placeholder="类型名称"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button size="sm" className="h-7 text-xs" onClick={handleAdd}>
            确认
          </Button>
        </div>
      )}

      {subSegmentTypes.map((type) => (
        <div key={type.id} className="flex items-center gap-2 text-xs">
          {editingId === type.id ? (
            <>
              <input
                type="color"
                className="w-5 h-5 rounded border-0 cursor-pointer"
                value={editColor}
                onChange={(e) => setEditColor(e.target.value)}
              />
              <Input
                className="h-6 text-xs flex-1"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmEdit()}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={confirmEdit}
              >
                <Check className="h-3 w-3" />
              </Button>
            </>
          ) : (
            <>
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: type.color }}
              />
              <span className="flex-1">{type.name}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => startEdit(type.id, type.name, type.color)}
              >
                <Edit2 className="h-3 w-3" />
              </Button>
              {!type.isPreset && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive"
                  onClick={() => deleteType(type.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
