import { memo, useEffect, useCallback, useMemo, useState } from "react";
import {
  CheckSquare,
  FolderPlus,
  PauseCircle,
  RefreshCw,
  PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskCard } from "@/components/TaskCard";
import { DataCollectCard } from "@/components/DataCollectCard";
import { ScanSchedulePanel } from "@/components/ScanSchedulePanel";
import { DiskUsagePanel } from "@/components/DiskUsagePanel";
import { DayFolderCard } from "@/components/DayFolderCard";
import { PathTree } from "@/components/PathTree";
import { useTaskStore } from "@/stores/task.store";
import { useTaskProgress } from "@/hooks/useTaskProgress";
import { showToast } from "@/components/ui/toast";
import { buildPathTree } from "@/lib/path-tree";
import {
  selectFolder,
  addFolder as addFolderApi,
  pauseTask,
  resumeTask,
  skipTask,
  restoreTask,
  retryTask,
  triggerScan,
  fetchDataCollectList,
  fetchDayFolders,
  ignoreDayFolder,
  restoreDayFolder,
  fetchSettings,
  fetchUploadQueueStatus,
  previewUploadPath,
  startUploadQueue,
  stopUploadQueue,
} from "@/lib/ipc-client";
import { IPC } from "@shared/ipc-channels";
import type {
  CloudProvider,
  DataCollectInfo,
  DayFolderSummary,
  Task,
  UploadQueueStatus,
} from "@shared/types";
import type { UploadPathPreview } from "@shared/upload-profile";
import { progressKey } from "@shared/cloud-upload";

type DashboardTreeItem =
  | { kind: "dayFolder"; dayFolder: DayFolderSummary }
  | { kind: "task"; task: Task };

export default function Dashboard() {
  const tasks = useTaskStore((state) => state.tasks);
  const loading = useTaskStore((state) => state.loading);
  const loadTasks = useTaskStore((state) => state.loadTasks);
  const [dataCollects, setDataCollects] = useState<DataCollectInfo[]>([]);
  const [dayFolders, setDayFolders] = useState<DayFolderSummary[]>([]);
  const [provider, setProvider] = useState<CloudProvider>("aliyun");
  const [providerReady, setProviderReady] = useState(false);
  const [profiles, setProfiles] = useState<Array<{ id: string; name: string; enabled: boolean }>>([]);
  const [pendingFolder, setPendingFolder] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [pathPreview, setPathPreview] = useState<UploadPathPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedDayFolderIds, setSelectedDayFolderIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [uploadQueueStatus, setUploadQueueStatus] =
    useState<UploadQueueStatus | null>(null);

  useTaskProgress();

  useEffect(() => {
    fetchSettings()
      .then((settings) => {
        setProvider(settings.cloud.targetMode === "tencent" ? "tencent" : "aliyun");
        setProfiles(settings.profiles.map((profile) => ({
          id: profile.id,
          name: profile.name,
          enabled: profile.enabled,
        })));
        setSelectedProfileId(settings.activeProfileId);
      })
      .catch(() => {})
      .finally(() => setProviderReady(true));
  }, []);

  useEffect(() => {
    if (!providerReady) return;
    loadTasks();
    fetchDataCollectList()
      .then(setDataCollects)
      .catch(() => {});
    fetchDayFolders({ limit: 30, provider, includeCompleted: false })
      .then(setDayFolders)
      .catch(() => {});
    fetchUploadQueueStatus()
      .then(setUploadQueueStatus)
      .catch(() => {});
  }, [loadTasks, provider, providerReady]);

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

  useEffect(() => {
    const off = window.api.on(
      IPC.DAY_FOLDER_EVENT,
      () => {
        fetchDayFolders({ limit: 30, provider, includeCompleted: false })
          .then(setDayFolders)
          .catch(() => {});
      }
    );
    return () => off();
  }, [provider]);

  useEffect(() => {
    const off = window.api.on(
      IPC.UPLOAD_QUEUE_EVENT,
      (_event: unknown, data: unknown) => {
        setUploadQueueStatus(data as UploadQueueStatus);
      },
    );
    return () => off();
  }, []);

  const handleAddFolder = useCallback(async () => {
    const folder = await selectFolder();
    if (folder) {
      const settings = await fetchSettings();
      setProfiles(settings.profiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        enabled: profile.enabled,
      })));
      setSelectedProfileId(settings.activeProfileId);
      setPendingFolder(folder);
    }
  }, []);

  useEffect(() => {
    if (!pendingFolder || !selectedProfileId) return;
    setPreviewLoading(true);
    previewUploadPath({
      sourcePath: pendingFolder,
      profileId: selectedProfileId,
    })
      .then(setPathPreview)
      .catch((err) => {
        setPathPreview(null);
        showToast(`路径预览失败: ${err}`, "error");
      })
      .finally(() => setPreviewLoading(false));
  }, [pendingFolder, selectedProfileId]);

  const handleConfirmAddFolder = useCallback(async () => {
    if (!pendingFolder) return;
    await addFolderApi(pendingFolder, selectedProfileId);
    setPendingFolder(null);
    setPathPreview(null);
    loadTasks();
  }, [loadTasks, pendingFolder, selectedProfileId]);

  const handleScan = useCallback(async () => {
    await triggerScan();
    await Promise.all([
      loadTasks(),
      fetchDayFolders({ limit: 30, provider, includeCompleted: false }).then(setDayFolders),
    ]);
  }, [loadTasks, provider]);

  const handleRefresh = useCallback(async () => {
    await Promise.all([
      loadTasks(),
      fetchDayFolders({ limit: 30, provider, includeCompleted: false }).then(setDayFolders),
    ]);
  }, [loadTasks, provider]);

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
      await skipTask(taskId);
      showToast("工作次已跳过", "warning");
    } catch (err) {
      showToast(`跳过失败: ${err}`, "error");
    }
  }, []);

  const handleRestore = useCallback(async (taskId: string) => {
    try {
      await restoreTask(taskId);
      await loadTasks();
      showToast("已恢复监控", "success");
    } catch (err) {
      showToast(`恢复失败: ${err}`, "error");
    }
  }, [loadTasks]);

  const handleIgnoreDay = useCallback(async (id: string) => {
    if (!window.confirm("确认忽略该日期下所有未完成工作次吗？")) return;
    await ignoreDayFolder(id);
    await Promise.all([
      loadTasks(),
      fetchDayFolders({ limit: 30, provider, includeCompleted: false }).then(setDayFolders),
    ]);
  }, [loadTasks, provider]);

  const handleRestoreDay = useCallback(async (id: string) => {
    await restoreDayFolder(id);
    await Promise.all([
      loadTasks(),
      fetchDayFolders({ limit: 30, provider, includeCompleted: false }).then(setDayFolders),
    ]);
  }, [loadTasks, provider]);

  const handleRetry = useCallback(async (
    taskId: string,
    retryProvider: CloudProvider
  ) => {
    try {
      await retryTask(taskId, retryProvider);
      showToast("任务已重新排队", "success");
    } catch (err) {
      showToast(`重试失败: ${err}`, "error");
    }
  }, []);

  const refreshDashboard = useCallback(async () => {
    await Promise.all([
      loadTasks(),
      fetchDayFolders({ limit: 30, provider, includeCompleted: false }).then(setDayFolders),
      fetchUploadQueueStatus().then(setUploadQueueStatus),
    ]);
  }, [loadTasks, provider]);

  const toggleTaskSelection = useCallback((taskId: string) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }, []);

  const toggleDaySelection = useCallback((dayFolderId: string) => {
    setSelectedDayFolderIds((current) => {
      const next = new Set(current);
      if (next.has(dayFolderId)) next.delete(dayFolderId);
      else next.add(dayFolderId);
      return next;
    });
  }, []);

  const handleStartUpload = useCallback(async (
    scope: "selected" | "all-pending",
  ) => {
    const latestStatus = await fetchUploadQueueStatus();
    let overrideWindow = false;
    if (!latestStatus.withinUploadWindow) {
      overrideWindow = window.confirm(
        "当前不在上传时间窗口内。\n\n确定：立即上传本次优先任务。\n取消：等待时间窗口后再上传。",
      );
    }

    const status = await startUploadQueue({
      scope,
      taskIds: scope === "selected" ? Array.from(selectedTaskIds) : [],
      dayFolderIds:
        scope === "selected" ? Array.from(selectedDayFolderIds) : [],
      overrideWindow,
    });
    setUploadQueueStatus(status);
    setSelectedTaskIds(new Set());
    setSelectedDayFolderIds(new Set());
    await refreshDashboard();
    showToast(
      status.priorityRemaining > 0
        ? `已开始上传，优先任务 ${status.priorityRemaining} 个`
        : "已开启上传队列",
      "success",
    );
  }, [refreshDashboard, selectedDayFolderIds, selectedTaskIds]);

  const handleStopUpload = useCallback(async () => {
    const latestStatus = await fetchUploadQueueStatus();
    const mode =
      latestStatus.runningTaskIds.length > 0 &&
      window.confirm(
        "当前有任务正在上传。\n\n确定：立即暂停正在上传的任务。\n取消：当前任务跑完后停止启动新任务。",
      )
        ? "pause-running"
        : "after-current";
    const status = await stopUploadQueue({ mode });
    setUploadQueueStatus(status);
    await refreshDashboard();
    showToast(
      mode === "pause-running" ? "上传已暂停" : "已停止启动新上传",
      "warning",
    );
  }, [refreshDashboard]);

  const providerTasks = useMemo(
    () =>
      tasks.filter((task) =>
        task.destinations.some((destination) => destination.provider === provider),
      ),
    [tasks, provider],
  );
  const independentTasks = useMemo(
    () => providerTasks.filter((task) => !task.dayFolderId),
    [providerTasks],
  );
  const tasksByDayFolderId = useMemo(() => {
    const grouped = new Map<string, Task[]>();
    for (const task of providerTasks) {
      if (!task.dayFolderId) continue;
      const current = grouped.get(task.dayFolderId) ?? [];
      current.push(task);
      grouped.set(task.dayFolderId, current);
    }
    return grouped;
  }, [providerTasks]);
  const taskDirectoryTree = useMemo(
    () =>
      buildPathTree<DashboardTreeItem>([
        ...dayFolders.map((dayFolder) => ({
          id: `day:${dayFolder.id}`,
          path: dayFolder.folderPath,
          value: { kind: "dayFolder" as const, dayFolder },
        })),
        ...providerTasks.map((task) => ({
          id: `task:${task.id}`,
          path: task.folderPath,
          value: { kind: "task" as const, task },
        })),
      ]),
    [dayFolders, providerTasks],
  );
  const hasTaskDirectories = taskDirectoryTree.length > 0;
  const selectedCount = selectedTaskIds.size + selectedDayFolderIds.size;
  const queueRunningCount = uploadQueueStatus?.runningTaskIds.length ?? 0;
  const queueStatusText = uploadQueueStatus?.gateOpen
    ? uploadQueueStatus.priorityActive
      ? `优先任务剩余 ${uploadQueueStatus.priorityRemaining}`
      : "上传队列已开启"
    : "上传队列已停止";

  useEffect(() => {
    const visibleTaskIds = new Set(providerTasks.map((task) => task.id));
    setSelectedTaskIds((current) => {
      const next = new Set(
        Array.from(current).filter((taskId) => visibleTaskIds.has(taskId)),
      );
      return next.size === current.size ? current : next;
    });
  }, [providerTasks]);

  useEffect(() => {
    const visibleDayFolderIds = new Set(dayFolders.map((item) => item.id));
    setSelectedDayFolderIds((current) => {
      const next = new Set(
        Array.from(current).filter((id) => visibleDayFolderIds.has(id)),
      );
      return next.size === current.size ? current : next;
    });
  }, [dayFolders]);

  return (
    <div className="p-6 space-y-6">
      {/* 顶栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">任务面板</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 text-xs text-muted-foreground">
            {queueStatusText}
            {queueRunningCount > 0 && ` · 运行中 ${queueRunningCount}`}
            {uploadQueueStatus && !uploadQueueStatus.withinUploadWindow && (
              <span> · 时间窗外</span>
            )}
          </div>
          <Button
            variant="default"
            size="sm"
            onClick={() => handleStartUpload("selected")}
            disabled={selectedCount === 0}
          >
            <PlayCircle className="h-4 w-4 mr-1" />
            开始选中 ({selectedCount})
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStartUpload("all-pending")}
          >
            <CheckSquare className="h-4 w-4 mr-1" />
            开始全部待处理
          </Button>
          <Button variant="outline" size="sm" onClick={handleStopUpload}>
            <PauseCircle className="h-4 w-4 mr-1" />
            停止上传
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
            onClick={handleRefresh}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="inline-flex rounded-md border p-1 bg-muted/30">
        {(["aliyun", "tencent"] as CloudProvider[]).map((item) => (
          <Button
            key={item}
            variant={provider === item ? "default" : "ghost"}
            size="sm"
            onClick={() => setProvider(item)}
          >
            {item === "aliyun" ? "阿里云" : "腾讯云"}
          </Button>
        ))}
      </div>

      {/* 扫描计划面板 */}
      <ScanSchedulePanel />

      {/* 磁盘用量 */}
      <DiskUsagePanel />

      {hasTaskDirectories && (
        <section>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">
            任务目录 ({dayFolders.length} 日期 / {providerTasks.length} 任务)
          </h2>
          <PathTree
            nodes={taskDirectoryTree}
            className="rounded-md border bg-muted/10 p-2"
            renderNodeBody={({ node }) => {
              const dayItems = node.items.filter(
                (item) => item.value.kind === "dayFolder",
              );
              const taskItems = node.items.filter(
                (item) => item.value.kind === "task",
              );

              if (dayItems.length === 0 && taskItems.length === 0) {
                return null;
              }

              return (
                <div className="space-y-3">
                  {dayItems.map((item) => {
                    if (item.value.kind !== "dayFolder") return null;
                    const dayFolder = item.value.dayFolder;
                    const childTasks = tasksByDayFolderId.get(dayFolder.id) ?? [];

                    return (
                      <div key={dayFolder.id} className="flex gap-3">
                        <input
                          type="checkbox"
                          checked={selectedDayFolderIds.has(dayFolder.id)}
                          onChange={() => toggleDaySelection(dayFolder.id)}
                          className="mt-5 h-4 w-4 shrink-0 rounded"
                          aria-label={`选择日期 ${dayFolder.date}`}
                        />
                        <div className="min-w-0 flex-1">
                          <DayFolderCardWithSpeed
                            dayFolder={dayFolder}
                            tasks={childTasks}
                            provider={provider}
                            onIgnore={handleIgnoreDay}
                            onRestore={handleRestoreDay}
                          />
                        {childTasks.length === 0 && (
                          <div className="ml-5 border-l pl-4 text-xs text-muted-foreground py-2">
                            尚未发现工作次
                          </div>
                        )}
                        </div>
                      </div>
                    );
                  })}

                  {taskItems.map((item) => {
                    if (item.value.kind !== "task") return null;
                    const task = item.value.task;

                    return (
                      <div key={task.id} className="flex gap-3">
                        <input
                          type="checkbox"
                          checked={selectedTaskIds.has(task.id)}
                          onChange={() => toggleTaskSelection(task.id)}
                          className="mt-5 h-4 w-4 shrink-0 rounded"
                          aria-label={`选择任务 ${task.folderName}`}
                        />
                        <div className="min-w-0 flex-1">
                          <TaskCardWithProgress
                            task={task}
                            provider={provider}
                            onPause={handlePause}
                            onResume={handleResume}
                            onCancel={handleCancel}
                            onRetry={handleRetry}
                            onRestore={handleRestore}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            }}
          />
          {independentTasks.length > 0 && (
            <div className="text-xs text-muted-foreground mt-2">
              独立任务 {independentTasks.length} 个
            </div>
          )}
        </section>
      )}

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

      {pendingFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl rounded-lg border bg-background p-5 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold">添加上传任务</h2>
                <p className="mt-1 text-xs text-muted-foreground break-all">
                  {pendingFolder}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setPendingFolder(null);
                  setPathPreview(null);
                }}
              >
                取消
              </Button>
            </div>

            <div className="mt-4">
              <label className="text-sm font-medium">项目 Profile</label>
              <select
                value={selectedProfileId}
                onChange={(event) => setSelectedProfileId(event.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {profiles
                  .filter((profile) => profile.enabled)
                  .map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="mt-4 rounded-md border bg-muted/20 p-3">
              <div className="text-sm font-medium">上传路径预览</div>
              {previewLoading && (
                <div className="mt-2 text-xs text-muted-foreground">生成预览中...</div>
              )}
              {!previewLoading && pathPreview && (
                <div className="mt-3 space-y-3">
                  {pathPreview.providers.map((item) => (
                    <div key={item.provider} className="rounded-md border bg-background p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span>{item.provider === "aliyun" ? "阿里云" : "腾讯云"}</span>
                        <span className="text-xs text-muted-foreground">{item.pathMode}</span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {item.keys.slice(0, 5).map((key) => (
                          <div key={key} className="break-all font-mono text-xs">
                            {key}
                          </div>
                        ))}
                      </div>
                      {[...item.errors, ...item.warnings].length > 0 && (
                        <div className="mt-2 text-xs text-destructive">
                          {[...item.errors, ...item.warnings].join("；")}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setPendingFolder(null);
                  setPathPreview(null);
                }}
              >
                取消
              </Button>
              <Button
                onClick={handleConfirmAddFolder}
                disabled={!selectedProfileId || previewLoading}
              >
                创建任务
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

const TaskCardWithProgress = memo(function TaskCardWithProgress({
  task,
  provider,
  onPause,
  onResume,
  onCancel,
  onRetry,
  onRestore,
}: {
  task: Task;
  provider: CloudProvider;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onCancel: (id: string) => void;
  onRetry: (id: string, provider: CloudProvider) => void;
  onRestore: (id: string) => void;
}) {
  const progress = useTaskStore(
    useCallback(
      (state) => state.progress[progressKey(task.id, provider)],
      [provider, task.id],
    ),
  );

  return (
    <TaskCard
      task={task}
      provider={provider}
      progress={progress}
      onPause={onPause}
      onResume={onResume}
      onCancel={onCancel}
      onRetry={onRetry}
      onRestore={onRestore}
    />
  );
});

const DayFolderCardWithSpeed = memo(function DayFolderCardWithSpeed({
  dayFolder,
  tasks,
  provider,
  onIgnore,
  onRestore,
}: {
  dayFolder: DayFolderSummary;
  tasks: Task[];
  provider: CloudProvider;
  onIgnore: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const speed = useTaskStore(
    useCallback(
      (state) =>
        tasks.reduce(
          (sum, task) =>
            sum + (state.progress[progressKey(task.id, provider)]?.speed || 0),
          0,
        ),
      [provider, tasks],
    ),
  );

  return (
    <DayFolderCard
      dayFolder={dayFolder}
      tasks={tasks}
      speed={speed}
      onIgnore={onIgnore}
      onRestore={onRestore}
    />
  );
});
