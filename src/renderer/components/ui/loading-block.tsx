import { RefreshCw } from "lucide-react";

interface LoadingBlockProps {
  text?: string;
}

export function LoadingBlock({ text = "加载中..." }: LoadingBlockProps) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-lg border px-4 py-12 text-sm text-muted-foreground">
      <RefreshCw className="h-4 w-4 animate-spin" />
      {text}
    </div>
  );
}
