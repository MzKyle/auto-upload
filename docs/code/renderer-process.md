# 渲染进程代码

## 入口

渲染进程入口：

```text
src/renderer/main.tsx
src/renderer/App.tsx
```

`App.tsx` 使用 `HashRouter` 组织页面：

| 路由 | 页面 | 说明 |
| --- | --- | --- |
| `/` | `Dashboard` | 任务面板 |
| `/settings` | `Settings` | 设置页 |
| `/history` | `History` | 历史记录 |
| `/ssh` | `SSHMachines` | 远程机器 |
| `/annotation` | `AnnotationApp` | 标注子应用 |

## IPC 客户端

文件：

```text
src/renderer/lib/ipc-client.ts
```

它把 `window.api` 调用封装成更具体的前端函数，例如：

- 获取任务列表
- 添加文件夹
- 暂停、恢复、取消、重试任务
- 获取和保存设置
- 测试 OSS
- 管理远程机器
- 打开标注窗口

阅读页面代码前，先看这里能快速知道前端有哪些可用后端能力。

## 状态管理

| 文件 | 说明 |
| --- | --- |
| `src/renderer/stores/task.store.ts` | 任务列表、加载状态、任务进度 |
| `src/renderer/stores/settings.store.ts` | 设置加载和保存 |
| `src/renderer/stores/annotation.store.ts` | 标注窗口状态 |

任务进度事件通过 `src/renderer/hooks/useTaskProgress.ts` 订阅主进程广播，并更新任务 store。

## Dashboard

文件：

```text
src/renderer/pages/Dashboard.tsx
```

任务面板负责把核心运行状态放到一个页面：

- 触发扫描
- 手动添加文件夹
- 打开标注窗口
- 展示扫描计划
- 展示磁盘用量
- 展示数采结果
- 展示活跃任务和近期完成任务
- 控制任务暂停、恢复、取消、重试

主要组件：

| 组件 | 说明 |
| --- | --- |
| `TaskCard` | 单个任务状态、进度、操作按钮 |
| `ScanSchedulePanel` | 扫描器状态和待稳定目录 |
| `DiskUsagePanel` | 扫描目录和远程落地目录磁盘使用 |
| `DataCollectCard` | 数采元信息展示 |

## Settings

文件：

```text
src/renderer/pages/Settings.tsx
```

设置页采用防抖自动保存：

1. 页面加载时读取完整设置。
2. 用户修改本地表单状态。
3. 600ms 后自动调用 `settings:save`。
4. 顶部显示“自动保存中 / 已自动保存 / 自动保存失败”。

包含配置：

- 扫描目录和扫描间隔
- 稳定性检查
- 数采模式
- 自动清理
- 上传并发和时间窗口
- OSS 参数和测试连接
- 文件过滤规则
- 日志目录和保留天数

## History

文件：

```text
src/renderer/pages/History.tsx
```

历史页从 `tasks` 表查询 completed/failed 任务，支持：

- 分页展示
- 清空历史
- 单条删除

删除历史只删除数据库任务记录，不删除本地文件。

## SSHMachines

文件：

```text
src/renderer/pages/SSHMachines.tsx
```

远程机器页负责：

- 添加机器
- 测试 SSH 连接
- 删除机器
- 触发 rsync 拉取
- 触发 SFTP 直传

前端表单中的 `transferMode` 决定按钮执行“拉取”还是“直传”。

## Annotation

目录：

```text
src/renderer/pages/annotation/
```

标注子应用被懒加载，核心文件：

| 文件 | 说明 |
| --- | --- |
| `AnnotationApp.tsx` | 标注页面布局 |
| `components/AnnotationCanvas.tsx` | Konva 画布 |
| `components/AnnotationToolbar.tsx` | 图片选择、保存、上传等工具栏 |
| `components/PropertiesPanel.tsx` | 标注属性面板 |
| `components/TypeManager.tsx` | 标注类型管理 |
| `helpers/geometry.ts` | 几何计算辅助函数 |

标注上传最终通过主进程 IPC 调用 OSS 服务。
