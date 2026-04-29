# 开发运行

## 安装依赖

在项目根目录执行：

```bash
npm install
```

安装过程中会执行 `electron-builder install-app-deps`，用于准备 Electron 原生依赖。如果 `better-sqlite3` 在当前系统上需要重建，后续打包命令也会执行 `electron-rebuild`。

## 启动开发环境

```bash
npm run dev
```

启动后会打开 Electron 窗口。主界面包含四个主要入口：

| 页面 | 用途 |
| --- | --- |
| 任务面板 | 查看活跃任务、触发扫描、手动添加文件夹、打开标注窗口 |
| 设置 | 配置扫描、上传、OSS、过滤规则、数采模式和自动清理 |
| 历史记录 | 分页查看完成/失败任务，并删除或清空历史 |
| 远程机器 | 管理 SSH 机器，触发 rsync 拉取或 SFTP 直传 |

## 推荐首次运行步骤

1. 进入“设置”页，填写 OSS 参数。
2. 点击“测试连接”，确认 Bucket 可访问。
3. 添加扫描目录，例如 `/tmp/upload_test`。
4. 将扫描间隔设置为 `5` 到 `10` 秒，方便本地验证。
5. 如不需要时间限制，可关闭开始时间和结束时间。
6. 回到“任务面板”，点击“触发扫描”。
7. 在扫描目录下创建一个子目录并放入测试文件，等待任务生成并上传。

## 常用命令

```bash
npm run dev
npm run typecheck
npm run build
npm run preview
npm run lint
```

## 开发时数据位置

SQLite 数据库位于 Electron `userData` 目录，文件名为：

```text
uploader.db
```

日志默认位于：

```text
userData/logs
```

具体路径会随操作系统和 Electron 应用名变化。应用启动时会在日志中打印数据库路径。

## 调试建议

- 如果任务没有启动，先看设置里的上传时间窗口。
- 如果目录未生成任务，查看扫描状态面板中的稳定性检查进度。
- 如果上传失败，优先看任务卡片错误信息，其次查看日志。
- 如果远程拉取失败，先在远程机器页执行 SSH 测试，再检查 `rsync` 或 `sshpass` 是否安装。
