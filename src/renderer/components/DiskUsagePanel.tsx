import { useState, useEffect, useCallback } from "react";
import { HardDrive, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { fetchDiskUsage } from "@/lib/ipc-client";
import { formatBytes } from "@/lib/utils";
import type { DiskUsageInfo } from "@shared/types";

function usageColor(percent: number): string {
  if (percent >= 90) return "text-red-600";
  if (percent >= 70) return "text-yellow-600";
  return "text-blue-600";
}

function progressColor(percent: number): string {
  if (percent >= 90) return "[&>div]:bg-red-500";
  if (percent >= 70) return "[&>div]:bg-yellow-500";
  return "";
}

export function DiskUsagePanel() {
  const [disks, setDisks] = useState<DiskUsageInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchDiskUsage();
      setDisks(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  if (disks.length === 0 && !loading) return null;

  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <HardDrive className="h-4 w-4" />
            磁盘用量
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={load}
            disabled={loading}
            className="h-6 px-2"
          >
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="space-y-2">
          {disks.map((d) => (
            <div key={d.path} className="flex items-center gap-3 text-xs">
              <span
                className="truncate text-muted-foreground min-w-0 flex-shrink"
                style={{ maxWidth: "40%" }}
                title={d.path}
              >
                {d.path}
              </span>
              <div className="flex-1 min-w-20">
                <Progress
                  value={d.usagePercent}
                  className={`h-2 ${progressColor(d.usagePercent)}`}
                />
              </div>
              <span className="whitespace-nowrap text-muted-foreground">
                {formatBytes(d.usedBytes)} / {formatBytes(d.totalBytes)}
              </span>
              <span
                className={`font-medium whitespace-nowrap w-10 text-right ${usageColor(
                  d.usagePercent
                )}`}
              >
                {d.usagePercent}%
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
