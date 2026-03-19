# 数据采集上传工具（Auto Upload）

一个面向工业/数据采集场景的 Electron 桌面应用：自动扫描文件夹、任务化上传阿里云 OSS、支持断点恢复、SSH 拉取、SFTP 直传、历史管理与标注导出。

## 功能特性

- 自动扫描目录并做稳定性检查，避免写入中的目录被提前上传
- 任务队列管理：`pending` / `scanning` / `uploading` / `completed` / `failed` / `paused`
- 手动添加任务、暂停/恢复/取消/重试
- 上传并发控制（任务级与全局级）
- 上传时间策略可配置：
  - 可设置开始时间与结束时间（支持跨天）
  - 开始或结束可单独不设置
  - 两者都不设置时随时可上传
- 阿里云 OSS 上传：普通上传 + 分片上传（大文件）
- 文件过滤规则：白名单、黑名单、正则、后缀
- SSH 机器管理：测试连接、`rsync` 拉取、本地落地后自动建任务
- SFTP 直传 OSS（按机器触发）
- 历史记录分页查询、单条删除、清空
- Webhook 通知（任务成功/失败）
- 自动清理（按保留天数与来源策略）
- 标注子窗口：图片标注、导出 PNG + JSON、上传 OSS

## 技术栈

- Electron + electron-vite + TypeScript
- React + React Router + Zustand
- TailwindCSS
- SQLite（`better-sqlite3`）
- 阿里云 OSS（`ali-oss`）
- SSH（`ssh2`）

## 项目结构

```text
src/
  main/       # 主进程：IPC、任务调度、扫描、上传、数据库
  preload/    # 安全桥接（contextBridge）
  renderer/   # 前端页面与组件
  shared/     # 共享类型与 IPC 常量
```

## 环境要求

- Node.js 18+（建议 20 LTS）
- npm 9+
- Linux 或 Windows（支持打包）

## 快速开始

```bash
npm install
npm run dev
```

## 常用命令

```bash
npm run dev
npm run typecheck
npm run build
npm run preview
npm run lint
```

## 打包发布

### Linux（含 `.deb`）

```bash
npm run build:linux
```

产物目录：`dist/`

### Windows

```bash
npm run build:win
```

### Linux + Windows

```bash
npm run build:all
```

## 首次使用配置建议

1. 进入“设置”页配置 OSS：`endpoint`、`region`、`bucket`、`accessKeyId`、`accessKeySecret`
2. 点击“测试连接”确保权限可用
3. 配置扫描目录与扫描间隔
4. 根据机器性能调整并发参数：
   - 最大并发任务数
   - 单任务并发文件数
   - 全局并发上传数
5. 选择上传时间策略（可不设置）
6. 按需开启 Webhook、自动清理、数采模式

## 上传时间策略说明

- **启用开始时间**：仅在到达该时间后允许启动新任务
- **启用结束时间**：仅在截止前允许启动新任务
- **仅设置开始时间**：到点后可持续启动，直到当天结束
- **开始/结束都不设置**：全天可启动任务，不受窗口限制

> 说明：时间策略影响“新任务启动”，不会中断正在上传的任务。

## 数据与文件说明

- 数据库：`uploader.db`（位于 Electron `userData` 目录）
- 任务标记文件：
  - `tmp_upload.json`
  - `process_task.json`
- 日志：默认在 `userData/logs`（可在设置里修改）

## 安全说明

- `contextIsolation = true`
- `nodeIntegration = false`
- 渲染进程通过 `preload` 暴露的 IPC API 与主进程通信

## 常见问题（FAQ）

### 1) 为什么新目录没有立刻上传？

系统会先做稳定性检查，确保文件不再变化后再入队；若设置了开始时间，也会等待到达时间窗口。

### 2) 为什么设置了结束时间后仍有任务在上传？

结束时间限制的是“是否允许启动新任务”，已在进行中的任务会继续直至完成。

### 3) OSS 测试连接失败怎么办？

优先检查：`endpoint`、`region`、`bucket` 是否匹配，AK/SK 是否具备对应 Bucket 读写权限，网络与 DNS 是否正常。

### 4) Linux 打包失败（`better-sqlite3` 相关）怎么办？

先清理依赖并重装，再执行打包命令：

```bash
rm -rf node_modules package-lock.json
npm install
npm run build:linux
```

## 开源协作

欢迎提交 Issue / PR：

1. Fork 仓库并创建功能分支
2. 提交改动并附上说明
3. 提交 PR，说明背景、方案与测试结果

建议提交前执行：

```bash
npm run typecheck
npm run lint
```

## 版本信息

当前版本：`1.0.0`

## 许可证

当前仓库尚未包含 `LICENSE` 文件。

如果你计划正式开源，建议补充 `MIT` 或 `Apache-2.0` 许可证，并在根目录新增对应 `LICENSE` 文件。
