# OSS 配置

## 字段说明

| 字段 | 示例 | 说明 |
| --- | --- | --- |
| Endpoint | `oss-cn-hangzhou.aliyuncs.com` | OSS 服务地址，可留空让 SDK 按 Region 推导 |
| Region | `oss-cn-hangzhou` | Bucket 所在地域 |
| Bucket | `my-bucket` | 目标 Bucket |
| Prefix | `upload/` | 可选，所有对象统一放到此前缀下 |
| AccessKey ID | `LTAI...` | 访问密钥 ID |
| AccessKey Secret | `***` | 访问密钥 Secret |

## 连接测试

点击“测试连接”后，主进程会：

1. 校验必填字段。
2. 创建临时 OSS client。
3. 对当前 Bucket 执行 `list({ max-keys: 1 })`。
4. 2xx 响应视为成功，否则返回具体错误。

连接成功表示当前配置至少具备 Bucket list 能力。实际上传仍要求具备 `PutObject` 或分片上传相关权限。

## 对象路径

普通上传对象路径：

```text
{prefix}/{folderName}/{relativePath}
```

如果 prefix 为空：

```text
{folderName}/{relativePath}
```

标注结果会在原图 base name 后追加：

```text
_annotation.png
_annotation.json
```

## 权限建议

生产环境建议创建专用 RAM 用户，只授予目标 Bucket 和目标 Prefix 的必要权限：

- 列出 Bucket 或 Prefix，用于连接测试和排查
- 上传对象
- 分片上传初始化、上传分片、完成分片
- 如需要覆盖同名对象，允许 `PutObject` 覆盖

不要在测试包或文档中写入真实 AK/SK。

## 排查清单

- Endpoint 是否和 Region 匹配
- Bucket 是否拼写正确
- AK/SK 是否启用且未过期
- RAM 策略是否允许目标 Prefix
- 本机 DNS 和网络是否能访问 OSS
- 系统时间是否严重偏差
- 大文件上传是否被代理或防火墙中断
