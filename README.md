# 数据采集上传工具

这是一个基于 `Electron + React + TypeScript + SQLite + 阿里云 OSS` 的桌面应用，用来在本地工位机上管理文件夹上传任务。

它的核心目标是：

- 自动或手动发现待上传文件夹。
- 将文件夹内的数据上传到阿里云 OSS。
- 在前端实时展示任务进度、速度、状态。
- 把任务、文件、设置、历史记录保存在本地数据库中。
- 支持失败重试、暂停恢复、扫描监控、SSH 远程同步等能力。



---

## 1. 这个项目是做什么的

这个项目本质上是一个“**本地采集目录上传管理器**”。

典型使用场景：

1. 工位机某个目录下会不断生成新的任务文件夹。
2. 软件定时扫描这些目录，发现新文件夹后先做稳定性检查。
3. 确认文件不再变化后，把它注册成一个上传任务。
4. 任务进入上传队列，后台开始把文件上传到阿里云 OSS。
5. 前端页面实时显示任务状态、进度、速度、错误信息。
6. 上传完成后，任务进入历史记录，后续可追溯。

除了本地扫描上传外，项目还支持：

- 手动添加本地文件夹。
- 从远程机器通过 `rsync` 同步到本地后自动创建上传任务。
- 通过 `SFTP -> OSS` 做直传。
- 数据采集模式（对焊接相关数据目录做元信息提取）。
- 图像标注子页面。

---

## 2. 技术栈总览

### 2.1 前端

- `React 18`
- `TypeScript`
- `React Router`
- `Zustand`
- `Tailwind CSS`
- 一套本地 `ui` 组件

### 2.2 桌面容器

- `Electron`
- `electron-vite`

### 2.3 后端能力（运行在 Electron 主进程）

- `better-sqlite3`：本地数据库
- `ali-oss`：阿里云 OSS 上传
- `ssh2`：SSH / SFTP
- `electron-log`：日志

### 2.4 为什么这样选型

- `Electron`：适合做桌面工具，能直接访问本地文件系统。
- `React`：界面开发快，组件化清晰。
- `TypeScript`：类型明确，适合长期维护。
- `SQLite`：部署简单，不需要单独数据库服务。
- `ali-oss`：官方生态常用 SDK，接 OSS 很直接。

---

## 3. 项目目录结构

项目主要代码都在 `src/` 下。

```text
src/
  main/       Electron 主进程，负责任务、上传、数据库、扫描、IPC
  preload/    预加载脚本，负责给前端暴露安全 API
  renderer/   React 前端页面
  shared/     主进程和渲染进程共享的类型、常量、IPC 通道
```

更细一点：

- `src/main/index.ts`：主进程入口。
- `src/main/ipc/index.ts`：所有 IPC 处理器注册点。
- `src/main/services/`：扫描、上传、队列、清理、SSH、Webhook 等服务。
- `src/main/db/`：数据库初始化和仓储层。
- `src/main/utils/`：日志、标记文件、速度计算、并发控制等工具。
- `src/renderer/pages/`：页面级组件，如任务面板、设置、历史记录。
- `src/renderer/components/`：复用 UI 组件。
- `src/renderer/stores/`：Zustand 状态管理。
- `src/renderer/lib/ipc-client.ts`：前端调用主进程的 API 封装。
- `src/shared/types.ts`：共享类型定义。
- `src/shared/constants.ts`：默认配置、状态文案、标记文件名。

---

## 4. 应用启动流程

应用主入口是 `src/main/index.ts`。

启动顺序可以概括成下面几步：

1. 初始化日志系统。
2. 初始化 SQLite 数据库。
3. 读取设置并重新应用日志配置。
4. 注册所有 IPC 处理器。
5. 创建主窗口和托盘。
6. 注册快捷键。
7. 启动后台服务：
   - 任务队列
   - 扫描器
   - 自动清理服务
8. 恢复未完成任务。

这说明项目不是“点击按钮才开始工作”，而是一个**桌面客户端 + 后台常驻服务**的模式。

---

## 5. 主进程、预加载、渲染进程分别做什么

这是 Electron 项目最重要的基础知识。

### 5.1 主进程 `main`

主进程负责“有系统权限的事情”，例如：

- 访问本地文件系统。
- 扫描目录。
- 上传 OSS。
- 连接 SQLite。
- 发 SSH / SFTP / Webhook 请求。
- 管理任务状态。

本项目中，真正的业务核心都在 `src/main/`。

### 5.2 预加载脚本 `preload`

`src/preload/index.ts` 的作用是通过 `contextBridge` 向前端暴露一个安全的 `window.api`。

它提供两个核心方法：

- `invoke(channel, args)`：调用主进程处理器。
- `on(channel, callback)`：监听主进程推送事件。

你可以把它理解为：**前端和主进程之间的桥**。

### 5.3 渲染进程 `renderer`

渲染进程就是 React 页面，负责：

- 显示任务列表。
- 展示进度条、速度、失败信息。
- 提供按钮操作（添加文件夹、暂停、重试、保存设置等）。
- 接收主进程推送的状态更新。

它不直接读文件、不直接连 OSS，而是通过 IPC 调主进程。

---

## 6. 任务上传主流程

这是这个项目最关键的一段业务链路。

### 6.1 文件夹怎么变成“任务”

入口有两种：

- **手动添加**：在任务面板点击“添加文件夹”。
- **自动扫描**：扫描器在监控目录里发现新子目录。

无论哪种方式，最后都会调用 `taskRepo.create(...)` 往数据库写入一条任务记录。

任务状态初始为：

- `pending`

### 6.2 扫描器做了什么

代码在 `src/main/services/scanner.service.ts`。

扫描器不是监听单个文件变化，而是：

1. 按设置里的扫描目录列表定时扫描。
2. 发现新的子目录后，不立刻上传。
3. 先进入“稳定性检查队列”。
4. 连续多次检查目录快照不再变化，才认为目录已写完。
5. 写入 `tmp_upload.json`。
6. 注册任务。

为什么要做稳定性检查？

因为工业现场数据文件可能还在持续写入，如果立刻上传，容易出现：

- 文件不完整。
- 上传一半内容。
- 最终 OSS 中的文件不是完整版本。

### 6.3 任务队列怎么调度

代码在 `src/main/services/task-queue.service.ts`。

任务队列会每 2 秒检查一次：

- 当前有多少任务正在执行。
- 配置允许的最大并发任务数是多少。
- 数据库中有哪些 `pending` 任务可以拉起来执行。

状态变化大致是：

```text
pending -> scanning -> uploading -> completed
pending -> uploading -> failed
uploading -> paused
paused -> pending
```

### 6.4 单个任务上传时做了什么

代码在 `src/main/services/task-runner.service.ts`。

一个任务的执行过程如下：

1. 读取过滤规则。
2. 扫描文件夹内可上传文件。
3. 计算总文件数和总字节数。
4. 往 `task_files` 表注册每个文件。
5. 找出待上传、失败、未完成的文件。
6. 更新任务状态为 `uploading`。
7. 并发上传文件到 OSS。
8. 上传过程中广播前端进度。
9. 周期性写 `process_task.json`。
10. 全部成功则标记任务完成；有失败则任务失败。

### 6.5 文件如何上传到 OSS

代码在 `src/main/services/oss-upload.service.ts`。

这里有两种上传方式：

- **小文件**：直接 `put`。
- **大文件**：`multipartUpload` 分片上传。

项目里默认分片阈值是 `100MB`，而你们实际场景多是小文件，所以大多数会走普通上传。

### 6.6 进度如何显示到页面上

上传过程中，主进程会广播 `IPC.TASK_PROGRESS`。

渲染进程中的 `useTaskProgress()` 会监听这些事件，然后更新 Zustand 中的 `progress`。

页面上的 `TaskCard` 再读取这些数据，展示：

- 已上传文件数
- 总文件数
- 已上传字节数
- 总字节数
- 当前上传文件名
- 当前速度

---

## 7. 数据库设计

数据库初始化代码在 `src/main/db/database.ts`。

数据库文件位置：

- Electron `userData` 目录下的 `uploader.db`

### 7.1 `tasks` 表

存储任务级信息，例如：

- 文件夹路径
- 文件夹名
- 当前状态
- 总文件数 / 已上传文件数
- 总字节数 / 已上传字节数
- 错误信息
- 来源类型（本地、手动、rsync）
- 创建时间、更新时间、完成时间

### 7.2 `task_files` 表

存储文件级信息，例如：

- 属于哪个任务
- 相对路径
- 文件大小
- 当前状态
- 上传后的 OSS Key
- 错误信息

### 7.3 `settings` 表

用来保存所有设置项，例如：

- 扫描目录
- OSS 配置
- 过滤规则
- 日志目录
- 并发参数

### 7.4 `ssh_machines` 表

保存远程机器信息，用于：

- rsync 同步
- SFTP 直传

---

## 8. 配置系统

共享默认配置在 `src/shared/constants.ts` 的 `DEFAULT_SETTINGS` 中。

主要配置分组如下：

- `scan`：扫描目录、扫描间隔。
- `upload`：任务并发、文件并发、分片阈值。
- `oss`：地域、桶名、前缀、AK/SK。
- `filter`：允许上传的后缀、白名单、黑名单、正则。
- `webhook`：上传完成/失败后通知外部系统。
- `stability`：稳定性检查参数。
- `log`：日志目录与保留天数。
- `dataCollect`：是否开启数采模式。
- `cleanup`：是否清理完成任务的本地目录。

设置保存流程：

1. 页面修改表单。
2. 调用 `saveSettings()`。
3. 通过 IPC 发送给主进程。
4. 主进程调用 `SettingsRepo.saveAll()` 写入 SQLite。

---

## 9. IPC 通信怎么理解

共享通道定义在 `src/shared/ipc-channels.ts`。

前端不会直接调用 `ipcRenderer.invoke('xxx')`，而是统一走 `src/renderer/lib/ipc-client.ts`。

例如：

- `fetchTasks()` 对应 `IPC.TASK_LIST`
- `addFolder()` 对应 `IPC.TASK_ADD_FOLDER`
- `pauseTask()` 对应 `IPC.TASK_PAUSE`
- `triggerScan()` 对应 `IPC.SCANNER_TRIGGER`

主进程在 `src/main/ipc/index.ts` 里统一处理这些调用。

这样设计的优点是：

- 前端调用简单。
- IPC 名字集中管理，不容易拼错。
- 代码结构清晰，便于排查。

---

## 10. 前端页面说明

### 10.1 `Dashboard`

文件：`src/renderer/pages/Dashboard.tsx`

这是主页面，也是你最应该先读的页面。

它负责：

- 加载任务列表。
- 加载数据采集结果。
- 触发手动扫描。
- 选择并添加文件夹。
- 暂停 / 恢复 / 取消 / 重试任务。
- 展示活跃任务和近期完成任务。

### 10.2 `Settings`

文件：`src/renderer/pages/Settings.tsx`

这是配置页面，负责修改：

- 扫描目录
- 稳定性检查参数
- 并发上传参数
- OSS 设置
- 日志目录
- 清理设置
- 数采模式

这个页面也很重要，因为主进程很多行为都依赖这里的配置。

### 10.3 `History`

文件：`src/renderer/pages/History.tsx`

展示已完成或失败的历史任务，数据来自 `HistoryRepo`。

### 10.4 `SSHMachines`

这个页面管理远程机器配置，给 `rsync` 和 `SFTP` 能力使用。

### 10.5 标注页面 `AnnotationApp`

这是一个独立子页面，通过新窗口打开，路径是 `#/annotation`。

---

## 11. 状态管理怎么读

项目使用 `Zustand`，比 Redux 更轻量。

### 11.1 `task.store.ts`

负责：

- 保存任务列表
- 保存任务进度字典
- 拉取任务列表
- 根据事件更新状态

### 11.2 `settings.store.ts`

负责：

- 加载设置
- 保存设置

### 11.3 为什么前端不用直接把所有状态都塞页面里

因为：

- 任务进度会持续推送，集中管理更清晰。
- 多个组件可能都要用到同一份状态。
- 页面刷新逻辑统一，不容易乱。

---

## 12. 日志系统

日志工具在 `src/main/utils/logger.ts`。

它的特点：

- 按日期分目录存放。
- 主日志写 `info.log`。
- `warn` 和 `error` 额外写到独立文件。
- 支持按保留天数清理旧日志。

日志目录默认在：

- `app.getPath('userData')/logs`

如果你调试时遇到问题，第一件事就是看日志。

---

## 13. 标记文件机制

工具函数在 `src/main/utils/marker-file.ts`。

项目里有两个非常关键的标记文件：

### 13.1 `tmp_upload.json`

表示：

- 这个目录已经通过稳定性检查。
- 可以被识别为上传任务。

### 13.2 `process_task.json`

表示：

- 这个目录上传到了哪一步。
- 哪些文件成功，哪些失败。
- 当前任务总体状态是什么。

这类标记文件的价值是：

- 便于现场排查。
- 便于重启恢复。
- 外部系统也可能据此判断状态。

---

## 14. 远程同步能力

虽然这个项目的核心是本地上传，但还扩展了远程同步。

### 14.1 `rsync`

流程大致是：

1. 从远程机器同步目录到本地。
2. 同步完成后自动创建本地上传任务。
3. 写入 `tmp_upload.json`，避免扫描器重复做稳定性检查。

### 14.2 `SFTP -> OSS`

这是另一条链路：

- 不经过本地落盘完整任务处理，而是直接从远程流式传到 OSS。

这部分对新手来说不是第一优先阅读内容，可以后看。

---

## 15. 数据采集模式

项目里有 `pre_upload_logic_code/` 和 `data-collect.service.ts`，说明作者还做了“数采模式”增强。

它的作用是对焊接/机器人/图像相关目录提取一些元信息，例如：

- 时间范围
- 图片数量
- 点云数量
- 标注信息
- 机器人状态文件概况

这些结果会在前端的 `DataCollectCard` 中展示。

所以这个项目不只是“上传器”，它还在向“**数据采集 + 上传 + 辅助分析工具**”发展。

---

## 16. 你应该按什么顺序读代码

如果你是新手，不要一上来就从头到尾硬啃所有文件。

推荐顺序如下：

### 第一步：先搞懂启动骨架

按顺序读：

1. `src/main/index.ts`
2. `src/preload/index.ts`
3. `src/renderer/App.tsx`
4. `src/renderer/main.tsx`

目标：明白 Electron 三层是怎么连起来的。

### 第二步：再看“前端如何点按钮触发后端”

按顺序读：

1. `src/renderer/pages/Dashboard.tsx`
2. `src/renderer/lib/ipc-client.ts`
3. `src/main/ipc/index.ts`

目标：明白一个按钮从前端到主进程的完整路径。

### 第三步：看上传核心链路

按顺序读：

1. `src/main/services/scanner.service.ts`
2. `src/main/services/task-queue.service.ts`
3. `src/main/services/task-runner.service.ts`
4. `src/main/services/oss-upload.service.ts`
5. `src/main/db/task.repo.ts`

目标：明白任务怎么产生、怎么调度、怎么上传、怎么落库。

### 第四步：看支撑能力

按顺序读：

1. `src/main/db/database.ts`
2. `src/main/db/settings.repo.ts`
3. `src/main/utils/logger.ts`
4. `src/main/utils/marker-file.ts`
5. `src/shared/types.ts`

目标：理解配置、日志、类型和存储。

### 第五步：最后再看扩展模块

- `ssh-rsync.service.ts`
- `webhook.service.ts`
- `data-collect.service.ts`
- `annotation/` 相关页面

---

## 17. 本地开发运行

下面命令来自 `package.json`。

### 17.1 安装依赖

```bash
cd /home/kyle/sany/ts_upload
npm install
```

### 17.2 启动开发环境

```bash
npm run dev
```

### 17.3 TypeScript 类型检查

```bash
npm run typecheck
```

### 17.4 构建

```bash
npm run build
```

### 17.5 构建 Linux 安装包

```bash
npm run build:linux
```

### 17.6 构建 Windows 安装包

```bash
npm run build:win
```

---

## 18. 首次运行前需要准备什么

至少要配置以下内容，否则上传功能跑不起来：

### 18.1 OSS 配置

在设置页填写：

- `Endpoint`
- `Region`
- `Bucket`
- `Prefix`
- `AccessKeyId`
- `AccessKeySecret`

### 18.2 扫描目录

在设置页添加要监控的目录。

### 18.3 过滤后缀

确认待上传文件的后缀在允许列表中，例如：

- `.jpg`
- `.png`
- `.csv`
- `.json`
- `.txt`

### 18.4 并发参数

初学者建议先用保守配置：

- 最大并发任务数：`2`
- 单任务并发文件数：`2`
- 全局并发上传数：`4`

等确认稳定后再往上调。

---

## 19. 一个完整的操作例子

假设你现在要验证上传功能，可以这样做：

1. 启动应用。
2. 进入“设置”。
3. 配好 OSS。
4. 添加一个本地扫描目录。
5. 回到“任务面板”。
6. 在扫描目录下新建一个子目录，并放入几张图片或文本文件。
7. 等待扫描器发现它。
8. 观察稳定性检查进度。
9. 观察任务进入上传中。
10. 观察进度条到 100%。
11. 去“历史记录”确认任务是否完成。
12. 去 OSS 控制台确认文件是否上传成功。

这是你最应该先自己走通的一条链路。

---

## 20. 调试时看哪里最有效

### 20.1 看前端按钮没反应

优先检查：

- `Dashboard.tsx` 里按钮是否调用了函数。
- `ipc-client.ts` 是否发出了正确 IPC。
- `src/main/ipc/index.ts` 是否注册了对应 handler。

### 20.2 看任务没有进入上传

优先检查：

- `scanner.service.ts` 是否发现目录。
- 稳定性检查是否通过。
- `taskRepo.create()` 是否成功写入。
- `task-queue.service.ts` 是否启动。

### 20.3 看上传失败

优先检查：

- OSS 配置是否正确。
- AccessKey 是否有权限。
- `oss-upload.service.ts` 日志。
- 网络是否正常。

### 20.4 看页面进度不更新

优先检查：

- `useTaskProgress.ts` 是否监听到 `TASK_PROGRESS`。
- `TaskCard.tsx` 是否拿到 `progress[task.id]`。

---

## 21. 这个项目目前还缺什么

结合现有代码和业务目标，我认为还有几个明显可以继续补强的点：

- **manifest.json 上传**：目前任务完成后还没有统一上传任务清单文件。
- **done.json 完成信号**：目前已有 webhook，但本地完成标记上传还可继续完善。
- **文件级重试策略更细化**：现在是失败后可重试任务，后续可区分可重试/不可重试错误。
- **更完善的日志结构化**：现在偏文本日志，后续可补更强的业务日志查询能力。
- **测试体系**：目前代码里看不到完整单元测试/集成测试。

这些点都适合作为你后续练手的开发任务。

---

## 22. 给实习生的建议：怎么快速上手这套代码

### 22.1 不要先追求“全懂”

先只搞懂一条主线：

`添加文件夹 -> 生成任务 -> 上传 -> 页面显示完成`

只要主线明白了，其他扩展功能就容易很多。

### 22.2 看代码时一定要带问题

比如：

- 任务是谁创建的？
- 状态是谁更新的？
- 进度是谁发出来的？
- 页面为什么会自动刷新？

带着这些问题读代码，比机械翻文件快很多。

### 22.3 多打印日志，多看数据库

你可以在关键位置打印：

- 任务创建
- 状态变化
- 上传开始/结束
- 失败原因

也可以直接查看 SQLite 中 `tasks` 和 `task_files` 的内容，这对理解业务特别有帮助。

### 22.4 先做小改动再做大需求

推荐练手顺序：

1. 改一个状态文案。
2. 加一个前端字段显示。
3. 给任务卡片加一行信息。
4. 给上传完成后补一个 `manifest.json` 生成逻辑。

这样会比一开始就改复杂流程安全得多。

---

## 23. 你后续最值得做的第一个增强点

如果你问“下一步最适合我做什么”，我建议是：

**在任务完成后自动生成并上传 `manifest.json` 和 `done.json`。**

原因：

- 它非常贴近你们的业务需求。
- 会练到主进程服务、数据库、OSS 上传、状态流转。
- 改动范围明确，适合实习生练手。

建议落点：

- 在 `task-runner.service.ts` 的“全部文件上传完成”后增加逻辑。
- 从 `taskRepo` 读出文件列表，组装 `manifest.json`。
- 上传 `manifest.json`。
- 再上传 `done.json`。
- 失败时写日志并让任务进入失败或补偿状态。

---

## 24. 总结

这个项目可以理解成：

**一个运行在工位机上的桌面数据上传系统**。

它把下面这些能力组合到了一起：

- 本地目录扫描
- 稳定性检查
- 任务调度
- OSS 上传
- 前端实时进度展示
- 本地数据库记录
- 历史追溯
- 远程同步
- 数据采集增强

如果你先读懂下面这 5 个文件，这个项目你就已经入门了：

1. `src/main/index.ts`
2. `src/main/ipc/index.ts`
3. `src/main/services/scanner.service.ts`
4. `src/main/services/task-runner.service.ts`
5. `src/renderer/pages/Dashboard.tsx`

读懂这 5 个文件之后，再往外扩展看数据库、设置、日志、SSH、标注，你会轻松很多。
