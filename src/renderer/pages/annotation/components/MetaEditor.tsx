import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

interface MetaEditorProps {
  meta: Record<string, string>;
  onChange: (meta: Record<string, string>) => void;
}

export function MetaEditor({ meta, onChange }: MetaEditorProps) {
  const entries = Object.entries(meta);
  const [newKey, setNewKey] = useState("");

  const handleValueChange = (key: string, value: string) => {
    onChange({ ...meta, [key]: value });
  };

  const handleKeyRename = (oldKey: string, newKeyName: string) => {
    const updated = { ...meta };
    const value = updated[oldKey];
    delete updated[oldKey];
    updated[newKeyName] = value;
    onChange(updated);
  };

  const handleDelete = (key: string) => {
    const updated = { ...meta };
    delete updated[key];
    onChange(updated);
  };

  const handleAdd = () => {
    const key = newKey.trim() || `field_${entries.length + 1}`;
    if (meta[key] !== undefined) return;
    onChange({ ...meta, [key]: "" });
    setNewKey("");
  };

  return (
    <div className="space-y-1.5">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-center gap-1">
          <Input
            className="h-7 text-xs flex-1"
            value={key}
            onChange={(e) => handleKeyRename(key, e.target.value)}
          />
          <Input
            className="h-7 text-xs flex-1"
            value={value}
            onChange={(e) => handleValueChange(key, e.target.value)}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 flex-shrink-0"
            onClick={() => handleDelete(key)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs w-full"
        onClick={handleAdd}
      >
        <Plus className="h-3 w-3 mr-1" />
        添加字段
      </Button>
    </div>
  );
}
