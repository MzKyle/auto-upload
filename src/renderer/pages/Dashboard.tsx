import { useEffect, useCallback, useState } from "react";
import { FolderPlus, RefreshCw, PlayCircle, PenTool } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskCard } from "@/components/TaskCard";
import { DataCollectCard } from "@/components/DataCollectCard";
import { ScanSchedulePanel } from "@/components/ScanSchedulePanel";
import { DiskUsagePanel } from "@/components/DiskUsagePanel";
import { useTaskStore } from "@/stores/task.store";
import { useTaskProgress } from "@/hooks/useTaskProgress";
import { showToast } from "@/components/ui/toast";
import {
  selectFolder,
  addFolder as addFolderApi,
  pauseTask,
  resumeTask,
  cancelTask,
  retryTask,
  triggerScan,
  fetchDataCollectList,
  openAnnotationWindow,
} from "@/lib/ipc-client";
import { IPC } from "@shared/ipc-channels";
import type { DataCollectInfo } from "@shared/types";

export default function Dashboard() {
  const { tasks, progress, loading, loadTasks } = useTaskStore();
  const [dataCollects, setDataCollects] = useState<DataCollectInfo[]>([]);

  useTaskProgress();

  useEffect(() => {
    loadTasks();
    fetchDataCollectList()
      .then(setDataCollects)
      .catch(() => {});
  }, [loadTasks]);

  // 监听新的数采结果
  useEffect(() => {
    const off = window.api.on(
      IPC.DATA_COLLECT_RESULT,
      (_event: unknown, data: unknown) => {
        const info = data as DataCollectInfo;
        setDataCollects((prev) => {
          const filtered = prev.filter((d) => d.folderPath !== info.folderPath);
          const updated = [info, ...filtered];
          return updated.slice(0, 100);
        });
      }
    );
    return () => {
      off();
    };
  }, []);

  const handleAddFolder = useCallback(async () => {
    const folder = await selectFolder();
    if (folder) {
      await addFolderApi(folder);
      loadTasks();
    }
  }, [loadTasks]);

  const handleScan = useCallback(async () => {
    await triggerScan();
    loadTasks();
  }, [loadTasks]);

  const handlePause = useCallback(async (taskId: string) => {
    try {
      await pauseTask(taskId);
      showToast("任务已暂停", "success");
    } catch (err) {
      showToast(`暂停失败: ${err}`, "error");
    }
  }, []);

  const handleResume = useCallback(async (taskId: string) => {
    try {
      await resumeTask(taskId);
      showToast("任务已恢复", "success");
    } catch (err) {
      showToast(`恢复失败: ${err}`, "error");
    }
  }, []);

  const handleCancel = useCallback(async (taskId: string) => {
    try {
      await cancelTask(taskId);
      showToast("任务已取消", "warning");
    } catch (err) {
      showToast(`取消失败: ${err}`, "error");
    }
  }, []);

  const handleRetry = useCallback(async (taskId: string) => {
    try {
      await retryTask(taskId);
      showToast("任务已重新排队", "success");
    } catch (err) {
      showToast(`重试失败: ${err}`, "error");
    }
  }, []);

  const activeTasks = tasks.filter(
    (t) => !["completed", "failed"].includes(t.status)
  );
  const doneTasks = tasks
    .filter((t) => ["completed", "failed"].includes(t.status))
    .slice(0, 10);

  return (
    <div className="p-6 space-y-6">
      {/* 顶栏 */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">任务面板</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openAnnotationWindow()}
          >
            <PenTool className="h-4 w-4 mr-1" />
            标注
          </Button>
          <Button variant="outline" size="sm" onClick={handleScan}>
            <PlayCircle className="h-4 w-4 mr-1" />
            触发扫描
          </Button>
          <Button size="sm" onClick={handleAddFolder}>
            <FolderPlus className="h-4 w-4 mr-1" />
            添加文件夹
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={loadTasks}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* 扫描计划面板 */}
      <ScanSchedulePanel />

      {/* 磁盘用量 */}
      <DiskUsagePanel />

      {/* 数据采集结果 */}
      {dataCollects.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">
            数据采集 ({dataCollects.length})
          </h2>
          {dataCollects.slice(0, 20).map((info) => (
            <DataCollectCard key={info.folderPath} info={info} />
          ))}
          {dataCollects.length > 20 && (
            <div className="text-xs text-muted-foreground text-center py-2">
              还有 {dataCollects.length - 20} 条记录...
            </div>
          )}
        </section>
      )}

      {/* 活跃任务 */}
      <section>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">
          活跃任务 ({activeTasks.length})
        </h2>
        {activeTasks.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-12 border rounded-lg border-dashed">
            暂无活跃任务，点击"添加文件夹"或启动扫描开始上传
          </div>
        ) : (
          activeTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              progress={progress[task.id]}
              onPause={handlePause}
              onResume={handleResume}
              onCancel={handleCancel}
              onRetry={handleRetry}
            />
          ))
        )}
      </section>

      {/* 近期完成 */}
      {doneTasks.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">
            近期完成
          </h2>
          {doneTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              progress={progress[task.id]}
              onPause={handlePause}
              onResume={handleResume}
              onCancel={handleCancel}
              onRetry={handleRetry}
            />
          ))}
        </section>
      )}
    </div>
  );
}
