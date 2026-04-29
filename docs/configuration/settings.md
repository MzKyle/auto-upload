# 设置总览

设置页采用自动保存模式。用户修改表单后，前端会延迟约 600ms 调用 `settings:save`，主进程把对应 section 写入 SQLite。

## 默认设置

核心默认值来自 `src/shared/constants.ts`。

| 分类 | 字段 | 默认值 | 说明 |
| --- | --- | --- | --- |
| 扫描 | `directories` | `[]` | 父级扫描目录列表 |
| 扫描 | `intervalSeconds` | `30` | 自动扫描间隔 |
| 稳定性 | `checkIntervalMs` | `5000` | 目录稳定性检查间隔 |
| 稳定性 | `checkCount` | `3` | 连续稳定次数 |
| 上传 | `maxConcurrentTasks` | `5` | 最大并发任务 |
| 上传 | `maxFilesPerTask` | `6` | 单任务文件并发 |
| 上传 | `maxConcurrentUploads` | `30` | 全局上传文件并发 |
| 上传 | `multipartThreshold` | `100 MB` | 分片上传阈值 |
| 上传 | `startAfterTime` | `20:30` | 默认开始时间 |
| 上传 | `endBeforeTime` | `23:59` | 默认结束时间 |
| 过滤 | `suffixes` | `.jpg .jpeg .png .bmp .csv .json .log .txt` | 默认上传后缀 |
| 清理 | `enabled` | `false` | 默认不开启自动清理 |
| 清理 | `retentionDays` | `7` | 默认保留天数 |
| 数采 | `enabled` | `false` | 默认不开启数采模式 |

## 扫描配置

扫描目录应填写批次目录的父目录。例如：

```text
/data/upload_root
```

如果采集程序生成：

```text
/data/upload_root/2026-04-29-001
```

则该子目录会在稳定后成为一个上传任务。

## 上传配置

建议按机器和网络能力调整：

| 环境 | 建议 |
| --- | --- |
| 本地测试 | 任务并发 `1-2`，单任务文件并发 `2-4` |
| 千兆内网到 OSS | 任务并发 `3-5`，全局并发 `20-50` |
| 弱网或共享网络 | 任务并发 `1-2`，全局并发 `5-10` |
| 大文件为主 | 降低文件并发，提高分片阈值前先压测 |

时间窗口只限制新任务启动，不中断正在上传中的任务。

## 文件过滤

过滤优先级：

```text
白名单 > 黑名单 > 正则排除 > 后缀匹配
```

白名单和黑名单支持：

- 完整文件名：`result.csv`
- 后缀：`.jpg`
- 简单通配符：`data_*.csv`

正则示例：

```text
.*\/debug\/.*
.*\.tmp$
```

## 数采模式

启用后，扫描器注册新目录时会尝试读取：

```text
welding_state/weld_signal.csv
```

如果存在，就提取焊接信号、相机、机器人状态和标注 XML 等元信息并展示在任务面板。

## 自动清理

启用自动清理前请确认 OSS 上传结果已经可以作为可靠归档。清理只作用于自动扫描和 rsync 来源任务，手动添加的文件夹不会被自动删除。
