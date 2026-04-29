# SSH / rsync / SFTP

## 远程机器模型

远程机器配置保存在 `ssh_machines` 表。主要字段包括：

| 字段 | 说明 |
| --- | --- |
| `name` | 机器显示名称 |
| `host` / `port` | SSH 地址和端口 |
| `username` | SSH 用户名 |
| `authType` | `key` 或 `password` |
| `privateKeyPath` | 密钥认证的私钥路径 |
| `remoteDir` | 远程数据目录 |
| `localDir` | rsync 模式下的本地落地目录 |
| `bwLimit` | rsync 带宽限制，单位 KB/s |
| `cpuNice` | 远端 rsync nice 值 |
| `transferMode` | `rsync` 或 `sftp` |

## SSH 测试

`testConnection` 使用 `ssh2` 建立连接，10 秒超时。密钥认证会读取本地私钥文件，密码认证会使用保存的密码字段。

测试通过只代表 SSH 可连通，不代表远程目录一定可读、rsync 一定可执行。

## rsync 模式

rsync 模式适合大批量数据和超大单文件。它的特点是：

- 先从远程机器拉取到本地 `localDir`
- 支持 `--partial`，中断后可保留部分文件
- 支持 `--progress`，向界面推送进度
- 支持带宽限制 `--bwlimit`
- 支持远端 `nice` 和 `ionice`，降低对采集机影响
- 拉取完成后自动创建上传任务

构造出的核心命令形态：

```text
rsync -avz --partial --progress --bwlimit=5000 \
  --rsync-path="nice -n 19 ionice -c 3 rsync" \
  -e "ssh -p 22 -o StrictHostKeyChecking=no" \
  user@host:/remote/dir/ /local/dir/
```

密码认证时会通过 `sshpass -p password rsync ...` 启动。

## rsync 完成后的动作

当 rsync 退出码为 `0`：

1. 更新远程机器的 `last_sync_at`。
2. 为 `localDir` 创建 `sourceType=rsync` 的上传任务。
3. 写入 `tmp_upload.json`，来源记录为 `rsync` 和机器 ID。
4. 任务进入普通队列，由 `TaskRunnerService` 上传到 OSS。

## SFTP 直传模式

SFTP 模式适合不想落盘的轻量同步：

1. 通过 SSH 建立 SFTP 会话。
2. 递归列出 `remoteDir` 下所有非隐藏文件。
3. 对每个文件创建读取流。
4. 合并成 Buffer。
5. 使用 `OSSUploadService.uploadBuffer` 上传 OSS。

OSS key 形态：

```text
{ossPrefix}/{remoteDirBaseName}/{relativePath}
```

## 模式选择

| 场景 | 推荐模式 | 原因 |
| --- | --- | --- |
| 文件多、体积大、网络可能中断 | rsync | 支持落盘、断点、后续 OSS 分片 |
| 本地磁盘紧张、文件较小 | SFTP | 不落盘，链路短 |
| 需要保留本地副本 | rsync | 同步目录本身就是本地备份 |
| 要控制采集机负载 | rsync | 可用 `nice`、`ionice`、`bwlimit` |
