# 环境依赖

## 运行环境

本项目是 Electron 桌面应用，开发和打包主要依赖 Node.js 生态，同时部分功能依赖系统命令。

| 依赖 | 建议版本 | 用途 |
| --- | --- | --- |
| Node.js | 18+，建议 20 LTS | 安装依赖、运行 electron-vite、执行 TypeScript 构建 |
| npm | 9+ | 包管理和脚本执行 |
| Linux / Windows | Ubuntu、Debian、Windows 均可 | 应用运行与打包目标 |
| 阿里云 OSS 账号 | 可写 Bucket | 上传文件、标注结果和 SFTP 直传数据 |
| rsync | Linux 发行版包管理器安装 | 远程机器拉取模式 |
| sshpass | 可选 | SSH 密码认证的 rsync 场景 |

## OSS 信息准备

首次使用前需要准备：

- `Endpoint`，例如 `oss-cn-hangzhou.aliyuncs.com`
- `Region`，例如 `oss-cn-hangzhou`
- `Bucket`
- `AccessKey ID`
- `AccessKey Secret`
- 可选 `Prefix`，用于把对象统一放到某个 OSS 前缀下

建议使用权限范围最小的 AK/SK，只授予目标 Bucket 的必要读写权限。连接测试会执行一次 `list` 请求，以验证当前配置确实能访问该 Bucket。

## 远程同步准备

如果需要使用远程机器页，需要额外确认：

- 本机可以访问远程机器的 SSH 端口，默认 `22`
- 密钥认证时，本机存在私钥文件，并且远程机器已配置公钥
- 密码认证时，Linux 上需要安装 `sshpass`
- rsync 模式下，本机和远程机器都应安装 `rsync`
- 远程目录和本地目录路径要填写完整，避免同步到非预期目录

## 目录约定

自动扫描模式以“父目录中的子目录”为任务单位。例如配置扫描目录为：

```text
/data/upload_root
```

应用会扫描：

```text
/data/upload_root/batch_001
/data/upload_root/batch_002
```

每个子目录会被注册为一个上传任务。父目录本身不会作为任务上传。

## 生产机建议

- 为扫描目录、rsync 本地落地目录预留足够磁盘空间
- 使用稳定网络或内网专线访问 OSS
- 将上传时间窗口安排在网络空闲时段
- 开启日志保留，并把异常日志纳入现场排查流程
- 大批量文件场景下，先用小并发压测，再逐步提高并发配置
