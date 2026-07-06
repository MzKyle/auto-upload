import { Badge } from "@/components/ui/badge";

interface AutoSaveStatusBadgeProps {
  state: "idle" | "saving" | "saved" | "error";
  lastSavedAt: string | null;
}

export function AutoSaveStatusBadge({
  state,
  lastSavedAt,
}: AutoSaveStatusBadgeProps) {
  if (state === "saving") {
    return <Badge variant="warning">保存中</Badge>;
  }
  if (state === "saved") {
    return (
      <Badge variant="success">
        {lastSavedAt ? `已保存 ${lastSavedAt}` : "已保存"}
      </Badge>
    );
  }
  if (state === "error") {
    return <Badge variant="destructive">保存失败</Badge>;
  }
  return <Badge variant="outline">未修改</Badge>;
}
