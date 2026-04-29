# 任务队列与上传执行

## TaskQueueService

队列服务每 2 秒检查一次 `pending` 任务。它决定“哪些任务现在可以启动”，判断条件包括：

- 是否配置了上传执行器
- 当前时间是否在上传窗口内
- 正在运行的任务数是否小于 `maxConcurrentTasks`
- 当配置开始时间时，任务是否属于当前可启动周期

符合条件的任务会被启动，并在 `runningTasks` 中登记一个取消函数。

## 并发模型

上传并发分三层：

| 配置 | 作用范围 | 默认值 |
| --- | --- | --- |
| `maxConcurrentTasks` | 同时运行多少个任务 | `5` |
| `maxFilesPerTask` | 单个任务内同时上传多少个文件 | `6` |
| `maxConcurrentUploads` | 所有任务共享的文件上传上限 | `30` |

例如有 5 个任务，每个任务最多 6 个文件并发，理论上会产生 30 个文件上传；全局信号量会确保跨任务总数不超过 `maxConcurrentUploads`。

## TaskRunnerService

执行器负责单个任务的完整生命周期：

1. 读取过滤规则和上传配置。
2. 配置 OSS，并创建任务级 OSS client。
3. 将任务状态更新为 `scanning`。
4. 递归扫描任务目录，过滤文件。
5. 更新任务总文件数和总字节数。
6. 把新文件注册到 `task_files` 表。
7. 找出待上传文件：`uploading + pending + failed`。
8. 并发上传文件，并广播进度。
9. 周期性写入 `process_task.json`。
10. 根据最终失败文件数量标记 `completed` 或 `failed`。

## 文件过滤

`FileFilterService` 的优先级是：

```text
白名单 > 黑名单 > 正则排除 > 后缀匹配
```

规则说明：

- 白名单命中后直接包含，即使后缀不在 suffixes 里。
- 黑名单命中后排除。
- 正则命中后排除。
- 配置后缀列表时，仅上传匹配后缀。
- 没有配置后缀时，默认包含所有未被排除的文件。

执行器还会自动跳过：

- 隐藏目录中的文件
- `tmp_upload.json`
- `process_task.json`

## 断点恢复

断点恢复依赖两部分：

- SQLite `task_files` 中每个文件的状态
- 任务目录内的 `process_task.json`

执行器重新运行时，会保留已完成文件，只重新处理：

```text
uploading + pending + failed
```

这样应用崩溃、任务暂停或网络失败后，可以通过“恢复”或“重试”把未完成文件重新推入上传。

## 重试策略

单文件上传失败时，执行器会判断是否为瞬时错误。可重试错误包括：

- HTTP `429`
- HTTP `5xx`
- `ECONNRESET`
- `ETIMEDOUT`
- `ESOCKETTIMEDOUT`
- `EAI_AGAIN`
- `ENOTFOUND`
- `EPIPE`
- 错误文本中包含 `timeout` 或 `temporarily unavailable`

每个文件最多重试 2 次，延迟使用指数退避，最高 5 秒。

## 取消与暂停

暂停任务时：

1. IPC 调用队列的 `cancelRunningTask`。
2. `AbortController` 发出取消信号。
3. 任务级 OSS client 执行 `cancel()`。
4. 当前文件回退为 `pending`。
5. 任务状态改为 `paused`。

恢复任务时只需把任务状态改回 `pending`，队列会在后续轮询中重新调度。
