# 共享契约与 IPC

## 为什么要有共享契约

Electron 应用分为主进程和渲染进程。这个项目不让渲染进程直接访问 Node API，而是通过 preload 暴露受控能力。因此跨进程数据结构必须清晰稳定。

共享契约集中在：

```text
src/shared/
  types.ts
  constants.ts
  ipc-channels.ts
```

## ipc-channels.ts

文件：

```text
src/shared/ipc-channels.ts
```

这里定义所有 IPC 通道名。好处是：

- 主进程和渲染进程不会手写字符串
- 改通道名时能集中修改
- 文档和代码可以统一索引

主要通道组：

| 分组 | 通道前缀 | 说明 |
| --- | --- | --- |
| 任务 | `task:*` | 任务列表、任务控制、进度事件 |
| 扫描器 | `scanner:*` | 扫描器状态和触发 |
| 设置 | `settings:*` | 配置读写和 OSS 测试 |
| 远程机器 | `ssh:*`、`rsync:*`、`sftp:*` | 机器管理和传输 |
| 历史 | `history:*` | 历史查询和删除 |
| 磁盘 | `disk:*` | 磁盘用量 |
| 标注 | `annotation:*` | 图片读取、导出、上传 |

## types.ts

文件：

```text
src/shared/types.ts
```

这里定义主进程和渲染进程共同理解的数据结构。

### 任务模型

| 类型 | 说明 |
| --- | --- |
| `TaskStatus` | 任务状态枚举 |
| `FileStatus` | 文件状态枚举 |
| `Task` | 任务主表映射 |
| `TaskFile` | 任务文件表映射 |
| `TaskProgress` | 上传进度事件 |
| `TaskStatusEvent` | 状态变化事件 |

### 设置模型

| 类型 | 说明 |
| --- | --- |
| `AppSettings` | 完整设置对象 |
| `ScanConfig` | 扫描目录和扫描间隔 |
| `UploadConfig` | 并发、分片阈值、时间窗口 |
| `OSSConfig` | OSS 连接参数 |
| `FilterRules` | 文件过滤规则 |
| `StabilityConfig` | 稳定性检查参数 |
| `CleanupConfig` | 自动清理参数 |

### 远程和数采模型

| 类型 | 说明 |
| --- | --- |
| `SSHMachine` | 已保存的远程机器 |
| `SSHMachineInput` | 新增机器表单输入 |
| `RsyncProgress` | rsync 进度事件 |
| `SftpProgress` | SFTP 直传进度事件 |
| `DataCollectInfo` | 数采模式提取出的元信息 |

## constants.ts

文件：

```text
src/shared/constants.ts
```

重要内容：

- `APP_NAME`
- `DEFAULT_SETTINGS`
- `MARKER_FILES`
- `TASK_STATUS_LABELS`

`DEFAULT_SETTINGS` 是设置页和仓储层合并默认配置的基础。新增配置项时，应同步更新这里和 `AppSettings` 类型。

## preload 边界

文件：

```text
src/preload/index.ts
```

preload 的职责是把有限 API 暴露给渲染进程。理想边界是：

- 渲染进程只调用 `invoke` 或订阅事件
- 不暴露 `fs`、`child_process`、数据库连接等底层能力
- 所有真正的副作用都留在主进程

## 添加新 IPC 的推荐步骤

1. 在 `src/shared/ipc-channels.ts` 增加通道常量。
2. 在 `src/shared/types.ts` 增加必要请求/响应类型。
3. 在 `src/main/ipc/index.ts` 注册 handler。
4. 在 `src/renderer/lib/ipc-client.ts` 封装前端调用函数。
5. 在页面或 store 中调用封装函数。
6. 如有事件推送，确认组件卸载时取消监听。

这样可以避免通道名散落、类型漂移和事件泄漏。
