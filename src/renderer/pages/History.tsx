import { useEffect, useState, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatBytes, formatDuration } from "@/lib/utils";
import { fetchHistory, clearHistory, deleteHistoryItem } from "@/lib/ipc-client";
import type { HistoryItem } from "@shared/types";

export default function History() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const pageSize = 20;

  const load = useCallback(async () => {
    const result = await fetchHistory({ page, pageSize });
    setItems(result.items);
    setTotal(result.total);
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleClear = useCallback(async () => {
    await clearHistory();
    load();
  }, [load]);

  const handleDeleteItem = useCallback(
    async (item: HistoryItem) => {
      const ok = window.confirm(`确认删除历史记录「${item.folderName}」吗？`);
      if (!ok) return;

      setDeletingId(item.id);
      try {
        await deleteHistoryItem(item.id);
        if (items.length === 1 && page > 1) {
          setPage((p) => p - 1);
          return;
        }
        await load();
      } finally {
        setDeletingId(null);
      }
    },
    [items.length, load, page]
  );

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">历史记录</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClear}
          disabled={items.length === 0}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          清空历史
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-12 border rounded-lg border-dashed">
          暂无历史记录
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium">文件夹</th>
                <th className="text-left p-3 font-medium">文件数</th>
                <th className="text-left p-3 font-medium">大小</th>
                <th className="text-left p-3 font-medium">耗时</th>
                <th className="text-left p-3 font-medium">状态</th>
                <th className="text-left p-3 font-medium">完成时间</th>
                <th className="text-left p-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="p-3">{item.folderName}</td>
                  <td className="p-3">{item.fileCount}</td>
                  <td className="p-3">{formatBytes(item.totalBytes)}</td>
                  <td className="p-3">
                    {formatDuration(item.durationSeconds)}
                  </td>
                  <td className="p-3">
                    <Badge
                      variant={
                        item.status === "completed" ? "success" : "destructive"
                      }
                    >
                      {item.status === "completed" ? "成功" : "失败"}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {new Date(item.completedAt).toLocaleString("zh-CN")}
                  </td>
                  <td className="p-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteItem(item)}
                      disabled={deletingId === item.id}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      {deletingId === item.id ? "删除中..." : "删除"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            上一页
          </Button>
          <span className="text-sm text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </Button>
        </div>
      )}
    </div>
  );
}
