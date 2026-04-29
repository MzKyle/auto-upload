# IPC 通道

## 说明

渲染进程通过 preload 暴露的 API 调用主进程，通道常量定义在：

```text
src/shared/ipc-channels.ts
```

主进程 handler 注册在：

```text
src/main/ipc/index.ts
```

## 任务管理

| 通道 | 方向 | 说明 |
| --- | --- | --- |
| `task:list` | invoke | 查询任务列表，可按状态过滤 |
| `task:get` | invoke | 查询单个任务 |
| `task:add-folder` | invoke | 手动添加文件夹任务 |
| `task:pause` | invoke | 暂停运行中任务 |
| `task:resume` | invoke | 恢复暂停任务 |
| `task:cancel` | invoke | 取消任务并标记失败 |
| `task:retry` | invoke | 将失败任务重新排队 |
| `task:progress` | push | 推送上传进度 |
| `task:status-change` | push | 推送状态变化 |

## 扫描器

| 通道 | 方向 | 说明 |
| --- | --- | --- |
| `scanner:status` | invoke | 获取扫描器状态 |
| `scanner:trigger` | invoke | 手动触发扫描 |
| `scanner:start` | invoke | 启动扫描器 |
| `scanner:stop` | invoke | 停止扫描器 |
| `scanner:event` | push | 推送扫描状态变化 |

## 设置

| 通道 | 方向 | 说明 |
| --- | --- | --- |
| `settings:get-all` | invoke | 获取合并默认值后的完整设置 |
| `settings:save` | invoke | 保存部分或全部设置 |
| `settings:test-oss` | invoke | 测试 OSS 连接 |

## 远程机器

| 通道 | 方向 | 说明 |
| --- | --- | --- |
| `ssh:list-machines` | invoke | 查询远程机器列表 |
| `ssh:add-machine` | invoke | 新增远程机器 |
| `ssh:update-machine` | invoke | 更新远程机器 |
| `ssh:delete-machine` | invoke | 删除远程机器 |
| `ssh:test-connection` | invoke | 测试 SSH 连接 |
| `rsync:start` | invoke | 启动 rsync 拉取 |
| `rsync:stop` | invoke | 停止 rsync |
| `rsync:progress` | push | 推送 rsync 进度 |
| `sftp:start` | invoke | 启动 SFTP 直传 |
| `sftp:stop` | invoke | 停止 SFTP |
| `sftp:progress` | push | 推送 SFTP 进度 |

## 历史、磁盘、数采、标注

| 通道 | 方向 | 说明 |
| --- | --- | --- |
| `history:list` | invoke | 分页查询历史 |
| `history:clear` | invoke | 清空历史 |
| `history:delete` | invoke | 删除单条历史 |
| `disk:usage` | invoke | 查询扫描目录和远程落地目录磁盘用量 |
| `data-collect:list` | invoke | 获取内存中的数采结果 |
| `data-collect:run` | invoke | 对指定目录执行数采分析 |
| `data-collect:result` | push | 推送数采结果 |
| `annotation:open-window` | invoke | 打开标注窗口 |
| `annotation:select-image` | invoke | 选择图片 |
| `annotation:read-image` | invoke | 读取图片 dataURL 和尺寸 |
| `annotation:save-export` | invoke | 保存 PNG 和 JSON |
| `annotation:upload-oss` | invoke | 上传标注结果到 OSS |
