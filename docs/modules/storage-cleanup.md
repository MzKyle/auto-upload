# 历史、存储与清理

## SQLite 存储

应用使用 `better-sqlite3`，数据库文件为：

```text
userData/uploader.db
```

初始化时会：

- 启用 `journal_mode = WAL`
- 启用外键
- 创建 `tasks`
- 创建 `task_files`
- 创建 `ssh_machines`
- 创建 `settings`
- 为旧数据库补充 `ssh_machines.transfer_mode`

## 历史记录

历史记录不是单独的历史表，而是从 `tasks` 表中筛选：

```text
status IN ('completed', 'failed') AND completed_at IS NOT NULL
```

历史页展示：

- 文件夹名
- 文件数
- 总大小
- 从创建到完成的耗时
- 成功/失败状态
- 完成时间

删除历史会删除对应任务，`task_files` 通过外键级联删除。

## 设置存储

设置按 key/value 写入 `settings` 表。每个 section 序列化为 JSON：

- `scan`
- `upload`
- `oss`
- `filter`
- `webhook`
- `stability`
- `log`
- `dataCollect`
- `cleanup`

读取时会与 `DEFAULT_SETTINGS` 合并，因此新增字段可以平滑获得默认值。

## 自动清理

`CleanupService` 用于释放本地磁盘空间。它只清理：

```text
status = completed
source_type IN ('local', 'rsync')
completed_at < cutoff
```

不会清理：

- 手动添加的任务，`sourceType=manual`
- 失败任务
- 未完成任务
- 尚未超过保留天数的任务

## 清理触发时机

- 应用启动后延迟 30 秒执行第一次计划清理
- 之后每小时执行一次
- 每个任务完成后会调度一次清理
- 设置变更时，如果修改了清理配置，也会重新调度

## 保留天数

`retentionDays` 会被规范化为非负整数。

| 值 | 行为 |
| --- | --- |
| `0` | 完成后尽快清理符合条件的目录 |
| `7` | 默认保留 7 天 |
| 非数字 | 回退到 7 天 |

## 风险提示

自动清理会递归删除任务目录。生产环境启用前应确认：

- 扫描目录不是业务唯一副本
- OSS 上传成功后对象可查
- `sourceType=local` 和 `rsync` 的目录确实允许被清理
- 手动添加的目录如需清理，应由用户自己管理
