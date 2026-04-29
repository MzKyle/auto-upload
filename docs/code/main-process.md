# 主进程代码

## 入口与生命周期

主进程入口是：

```text
src/main/index.ts
```

它承担 Electron 应用的基础生命周期工作：

- 创建主窗口
- 配置安全选项
- 初始化 SQLite
- 注册 IPC
- 启动扫描器、任务队列、自动清理等服务
- 创建标注子窗口

阅读时建议重点看窗口创建参数，确认 `contextIsolation` 和 `nodeIntegration` 的安全配置。

## IPC 聚合层

文件：

```text
src/main/ipc/index.ts
```

这是主进程业务能力的统一入口。渲染进程不会直接访问数据库、文件系统或 OSS，而是通过这里注册的 handler 调用。

主要分组：

| 分组 | 代表通道 | 说明 |
| --- | --- | --- |
| 任务管理 | `task:list`、`task:pause`、`task:retry` | 查询任务、控制任务状态 |
| 扫描器 | `scanner:status`、`scanner:trigger` | 获取扫描状态、手动触发扫描 |
| 设置 | `settings:get-all`、`settings:save`、`settings:test-oss` | 加载保存设置、测试 OSS |
| 远程机器 | `ssh:*`、`rsync:*`、`sftp:*` | 机器管理和远程传输 |
| 历史 | `history:list`、`history:delete` | 完成/失败任务查询 |
| 标注 | `annotation:*` | 图片读取、导出、上传标注结果 |
| 磁盘用量 | `disk:usage` | 扫描目录和远程落地目录空间统计 |

## 数据库层

数据库初始化：

```text
src/main/db/database.ts
```

主要仓储：

| 文件 | 说明 |
| --- | --- |
| `settings.repo.ts` | 设置按 section 存储，读取时合并默认值 |
| `task.repo.ts` | 任务、文件状态、进度和断点恢复数据 |
| `history.repo.ts` | 从任务表筛选完成/失败记录 |

`database.ts` 会创建四张核心表：

- `tasks`
- `task_files`
- `ssh_machines`
- `settings`

并启用 `WAL` 和外键。

## 扫描器

文件：

```text
src/main/services/scanner.service.ts
```

核心逻辑：

1. 周期读取 `settings.scan.directories`。
2. 扫描每个父目录下的子目录。
3. 跳过隐藏目录。
4. 对新目录建立 size/mtime 快照。
5. 多轮快照一致后写入 `tmp_upload.json`。
6. 创建 `pending` 任务。
7. 如启用数采模式，同步提取数据目录元信息。

这里是“数据从文件系统进入任务系统”的入口。

## 队列服务

文件：

```text
src/main/services/task-queue.service.ts
```

队列每 2 秒检查一次 pending 任务。它负责：

- 判断上传时间窗口
- 控制最大并发任务数
- 维护运行中任务的取消函数
- 调用任务执行器
- 把任务标记为 completed 或 failed

时间窗口只控制新任务启动，不会中断正在上传中的任务。

## 上传执行器

文件：

```text
src/main/services/task-runner.service.ts
```

单个任务的完整流程都在这里：

```text
读取配置
  -> 创建任务级 OSS client
  -> 扫描文件
  -> 应用过滤规则
  -> 注册 task_files
  -> 合并 pending / failed / uploading 文件
  -> 按并发上传
  -> 广播进度
  -> 写 process_task.json
  -> 检查失败文件并结束任务
```

注意两个设计点：

- 任务级 OSS client 让取消操作尽量只影响当前任务。
- 全局上传信号量让多个任务之间共享总并发上限。

## OSS 服务

文件：

```text
src/main/services/oss-upload.service.ts
```

封装了三种上传：

- `uploadFile`：文件路径上传，小文件普通上传，大文件分片上传
- `uploadBuffer`：Buffer 上传，用于 SFTP 直传和标注结果
- `testConnection`：通过访问目标 Bucket 验证配置真实可用

大文件分片会动态计算 part size，避免分片数量超过 OSS 限制。

## 远程同步

文件：

```text
src/main/services/ssh-rsync.service.ts
```

包含两条链路：

- rsync：拉取到本地目录，完成后创建普通上传任务。
- SFTP：递归读取远程文件，直接通过 OSS Buffer 上传。

大文件或弱网场景推荐 rsync，因为它能落盘、保留部分文件，并交给普通上传链路做分片和重试。
