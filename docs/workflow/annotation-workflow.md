# 标注导出与上传

## 操作流程

1. 在任务面板点击“标注”。
2. 在标注窗口选择图片。
3. 绘制或编辑标注。
4. 导出 PNG 和 JSON。
5. 点击上传，将标注结果写入 OSS。

## 推荐用法

如果要让标注结果和原始数据保存在同一 OSS 目录，建议从已经上传或正在上传的任务目录中选择图片。这样上传时可以匹配到任务，并生成稳定路径：

```text
{prefix}/{folderName}/{relativeImagePathWithoutExt}_annotation.png
{prefix}/{folderName}/{relativeImagePathWithoutExt}_annotation.json
```

## 导出文件管理

导出会在本地生成 PNG 和 JSON。它们不会自动加入任务文件列表，也不会改变原始任务状态。是否保留本地导出文件由用户自己决定。

## 上传失败排查

- OSS 是否配置并测试成功
- 本地导出的 PNG/JSON 是否仍存在
- 原图是否可读
- 如果路径不符合预期，检查原图是否位于某个任务目录下
- 查看日志中的 `[Annotation]` 前缀记录
