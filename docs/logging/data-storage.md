# 数据存储结构

## 数据库位置

数据库文件：

```text
userData/uploader.db
```

Electron 的 `userData` 路径由操作系统决定。应用启动日志会打印实际数据库路径。

## tasks 表

| 字段 | 说明 |
| --- | --- |
| `id` | 任务 ID |
| `folder_path` | 本地任务目录 |
| `folder_name` | 文件夹名 |
| `status` | 任务状态 |
| `total_files` | 文件总数 |
| `uploaded_files` | 已上传文件数 |
| `total_bytes` | 总字节数 |
| `uploaded_bytes` | 已上传字节数 |
| `oss_prefix` | 任务创建时使用的 OSS 前缀 |
| `error_message` | 任务级错误 |
| `source_type` | `local`、`rsync` 或 `manual` |
| `source_machine_id` | 远程机器 ID |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |
| `completed_at` | 完成或失败时间 |

## task_files 表

| 字段 | 说明 |
| --- | --- |
| `id` | 文件记录 ID |
| `task_id` | 所属任务 |
| `relative_path` | 相对任务目录路径 |
| `file_size` | 文件大小 |
| `status` | 文件状态 |
| `oss_key` | 上传成功后的 OSS key |
| `upload_id` | 预留上传 ID |
| `error_message` | 文件级错误 |
| `created_at` | 创建时间 |
| `updated_at` | 更新时间 |

## ssh_machines 表

| 字段 | 说明 |
| --- | --- |
| `id` | 机器 ID |
| `name` | 显示名称 |
| `host` | 主机地址 |
| `port` | SSH 端口 |
| `username` | 用户名 |
| `auth_type` | `key` 或 `password` |
| `private_key_path` | 私钥路径 |
| `encrypted_password` | 密码字段 |
| `remote_dir` | 远程目录 |
| `local_dir` | 本地落地目录 |
| `bw_limit` | rsync 带宽限制 |
| `cpu_nice` | 远端 nice 值 |
| `transfer_mode` | `rsync` 或 `sftp` |
| `enabled` | 是否启用 |
| `last_sync_at` | 最近同步时间 |
| `created_at` | 创建时间 |

## settings 表

`settings` 是 key/value 表：

| 字段 | 说明 |
| --- | --- |
| `key` | 设置 section 名 |
| `value` | JSON 字符串 |
| `updated_at` | 更新时间 |

## 标记文件

### tmp_upload.json

表示目录已被扫描器登记：

```json
{
  "version": 1,
  "createdAt": "2026-04-29T10:00:00.000Z",
  "folderPath": "/data/upload_root/batch_001",
  "metadata": {
    "source": "local",
    "machineId": "optional"
  }
}
```

### process_task.json

表示上传过程和最终结果：

```json
{
  "version": 1,
  "taskId": "uuid",
  "status": "uploading",
  "totalFiles": 10,
  "uploadedFiles": 4,
  "files": {
    "a.txt": "completed",
    "b.txt": "pending"
  },
  "lastUpdated": "2026-04-29T10:10:00.000Z",
  "error": null
}
```

## 日志

日志使用 `electron-log`。默认目录为 `userData/logs`，设置页中可配置日志目录和保留天数。排查上传问题时重点搜索：

- `任务失败`
- `上传失败`
- `OSS`
- `rsync`
- `SFTP`
- `[Annotation]`
- `自动清理`
