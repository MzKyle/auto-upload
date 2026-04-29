# OSS 上传服务

## 职责

`OSSUploadService` 封装了阿里云 OSS 的连接、测试和上传能力。执行器不直接依赖 `ali-oss` 细节，而是通过服务完成：

- 读取 OSS 配置并创建 client
- 测试 Bucket 可访问性
- 普通文件流式上传
- 大文件分片上传
- Buffer 上传，用于 SFTP 直传和标注结果
- 任务级 client 创建和取消

## 连接配置

需要的字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `region` | 是 | OSS Region，例如 `oss-cn-hangzhou` |
| `bucket` | 是 | Bucket 名称 |
| `accessKeyId` | 是 | AccessKey ID |
| `accessKeySecret` | 是 | AccessKey Secret |
| `endpoint` | 否 | 自定义 Endpoint，可为空 |
| `prefix` | 否 | 对象前缀，不参与 client 创建 |

连接测试会创建一个临时 client，并执行：

```text
list({ max-keys: 1 })
```

只有返回 2xx HTTP 状态码才视为成功。

## 上传路径规则

普通任务上传的 OSS key 形态：

```text
{ossPrefix}/{folderName}/{relativePath}
```

示例：

```text
upload/batch_001/camera1/001.jpg
```

实现中会把 Windows 反斜杠统一替换为 `/`，保证 OSS 对象路径稳定。

## 普通上传与分片上传

默认分片阈值是：

```text
100 MB
```

| 文件大小 | 上传方式 |
| --- | --- |
| 小于等于阈值 | `client.put(key, createReadStream(filePath))` |
| 大于阈值 | `client.multipartUpload(key, filePath, options)` |

分片上传会根据文件大小动态计算 `partSize`，避免超过 OSS 最大分片数量 `10000`。最小分片大小为 `1 MB`，最终按 `1 MB` 向上取整。

## 任务级 client

每个上传任务会调用 `createTaskClient()` 创建独立 OSS client。这样某个任务暂停或取消时，调用 `cancel()` 不会影响其他正在上传的任务。

## Buffer 上传

`uploadBuffer(buffer, ossKey)` 用在两个场景：

- SFTP 直传：远程文件通过 SFTP 读到内存后上传
- 标注上传：本地导出的 PNG 和 JSON 读成 Buffer 后上传

当前 Buffer 上传不走大文件分片逻辑，因此超大文件建议走普通任务上传。

## 常见失败原因

- Endpoint 和 Region 不匹配
- Bucket 名称错误
- AK/SK 没有 Bucket 读写权限
- 网络或 DNS 不通
- 上传时间过长导致连接超时
- OSS 限流返回 `429`
- 文件上传过程中被删除或被占用
