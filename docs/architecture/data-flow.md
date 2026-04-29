# 数据流

## 自动扫描上传流

```mermaid
sequenceDiagram
    participant User as 用户
    participant UI as React 页面
    participant Scanner as ScannerService
    participant Queue as TaskQueueService
    participant Runner as TaskRunnerService
    participant DB as SQLite
    participant OSS as Aliyun OSS

    User->>UI: 配置扫描目录与 OSS
    UI->>Scanner: 启动或触发扫描
    Scanner->>Scanner: 扫描父目录下子目录
    Scanner->>Scanner: 多轮 size/mtime 稳定性检查
    Scanner->>DB: 创建 pending 任务
    Scanner->>Scanner: 写入 tmp_upload.json
    Queue->>DB: 查询 pending 任务
    Queue->>Queue: 判断上传时间窗口和并发槽位
    Queue->>Runner: 启动任务
    Runner->>DB: 状态改为 scanning / uploading
    Runner->>Runner: 递归扫描并过滤文件
    Runner->>DB: 注册 task_files
    Runner->>OSS: 并发上传文件
    Runner->>DB: 更新文件状态和任务进度
    Runner->>UI: 广播 TASK_PROGRESS
    Runner->>Scanner: 写入 process_task.json
    Queue->>DB: 标记 completed 或 failed
```

## 远程 rsync 流

rsync 模式适合远程机器先把数据落到本机，再进入普通任务上传链路。

```mermaid
graph LR
    Remote["远程机器目录"] --> RSYNC["rsync 拉取<br/>--partial --progress"]
    RSYNC --> Local["本地落地目录"]
    Local --> Marker["写 tmp_upload.json"]
    Marker --> Task["创建 sourceType=rsync 任务"]
    Task --> Queue["任务队列"]
    Queue --> OSS["OSS 上传"]
```

rsync 完成后，应用会自动为 `localDir` 创建上传任务，并把来源记录为 `rsync`。

## SFTP 直传流

SFTP 模式适合不希望在本地落盘的场景。服务会递归列出远程目录中的文件，通过 SFTP 读取 Buffer，然后调用 OSS Buffer 上传。

```mermaid
graph LR
    Remote["远程目录"] --> SFTP["SFTP 递归读取"]
    SFTP --> Buffer["内存 Buffer"]
    Buffer --> OSS["OSS put"]
```

当前实现会把单个文件读取成 Buffer 后上传，因此超大单文件场景更推荐使用 rsync 落盘上传，让 OSS 分片上传逻辑接管。

## 标注上传流

```mermaid
sequenceDiagram
    participant A as Annotation Window
    participant IPC as 主进程 IPC
    participant DB as TaskRepo
    participant OSS as OSSUploadService

    A->>IPC: 选择图片并读取 dataURL
    A->>A: 绘制标注
    A->>IPC: 导出 PNG 和 JSON
    IPC->>IPC: 写入本地导出文件
    A->>IPC: 上传标注结果
    IPC->>DB: 查找包含原图的任务
    IPC->>OSS: 上传 *_annotation.png
    IPC->>OSS: 上传 *_annotation.json
```

如果原图属于某个任务目录，标注结果会沿用任务的 OSS 前缀和文件相对路径；如果匹配不到任务，则使用配置里的 OSS 前缀加图片名。

## 进度事件流

主进程通过事件向渲染窗口推送进度：

| 事件 | 来源 | 内容 |
| --- | --- | --- |
| `task:progress` | `TaskRunnerService` | 已上传文件数、字节数、速度、当前文件 |
| `task:status-change` | `TaskQueueService` / IPC 操作 | 任务状态变化 |
| `scanner:event` | `ScannerService` | 扫描器运行状态、待稳定目录、最近扫描结果 |
| `rsync:progress` | `SSHRsyncService` | rsync 百分比、速度、当前输出行 |
| `sftp:progress` | `SSHRsyncService` | SFTP 文件总数、已传数量、当前文件 |
| `data-collect:result` | `ScannerService` / IPC | 数采元信息 |
