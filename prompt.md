你是资深全栈工程师。请从零实现一个可生产使用的 Electron 桌面应用（TypeScript），名称“数据采集上传工具”。要求在 Linux/Windows 可打包安装（Linux 产物包含 .deb）。

【技术栈】
- Electron + electron-vite + React + TypeScript
- UI: TailwindCSS + 自定义基础组件（Button/Card/Input/Badge/Toast）
- 状态管理: zustand
- 数据库: better-sqlite3（WAL 模式，外键开启）
- 对象存储: ali-oss
- SSH/传输: ssh2（支持 rsync 拉取与 SFTP 直传 OSS 两种模式）
- 路由: react-router（HashRouter）
- 日志: electron-log
- UUID: uuid

【应用目标】
这是一个“文件夹自动扫描 + 上传阿里云 OSS + 任务可恢复 + 历史管理 + SSH远程拉取 + 数采分析 + 标注窗口”的桌面工具。

【必须实现的核心功能】
1) 任务系统
- 任务状态：pending/scanning/uploading/completed/failed/paused
- 支持手动添加文件夹任务
- 支持暂停、恢复、取消、重试
- 支持任务进度广播（已上传文件、字节、速度、当前文件）
- 失败文件可重试，断点恢复时上传中状态要回退并继续

2) 扫描器
- 周期扫描配置目录，发现新子目录后不立刻入队
- 做稳定性检查（按配置次数+间隔），确认文件写入完成后再入队
- 写入 marker 文件（tmp_upload.json / process_task.json）避免重复处理
- 广播扫描器状态（运行状态、上次扫描、待稳定目录队列）

3) 上传执行器与队列
- 队列每2秒调度，限制最大并发任务数
- 单任务内并发上传文件（maxFilesPerTask）
- 全局上传并发信号量（maxConcurrentUploads）跨任务限流
- 文件过滤规则：白名单 > 黑名单 > 正则排除 > 后缀列表
- 后缀规则必须兼容“csv”和“.csv”，并保证.csv可上传
- 上传时间窗：startAfterTime + endBeforeTime（支持跨天，如20:30-06:00）
- 上传完成写 process_task.json

4) OSS 功能
- 普通上传 + 大文件分片上传（multipart）
- 配置项：endpoint、bucket、region、prefix、AK/SK、分片阈值
- “测试连接”必须是真实校验目标 bucket 可访问：不能假成功
  - 校验必填项
  - 使用 list({max-keys:1}) 或等效 bucket 访问请求验证权限与可达性
  - 返回明确错误信息（code/status/message）

5) SSH 机器管理
- 机器 CRUD：host/port/username/认证方式(key/password)/remoteDir/localDir/bwLimit/cpuNice/transferMode/enabled
- 测试连接
- 执行 rsync 拉取后自动创建上传任务
- 支持 SFTP 直传 OSS 并推送进度

6) 设置系统
- 设置分类：scan/upload/oss/filter/webhook/stability/log/dataCollect/cleanup/hotkey
- 默认值完整
- 设置页“自动保存”（防抖），无需手动点保存
- 显示“自动保存中/已保存/失败”状态

7) 历史记录
- 分页查询 completed/failed 历史
- 支持“清空历史”
- 支持“单条删除历史记录”

8) 标注功能（独立窗口）
- 主窗口可打开 annotation 子窗口
- 可选择图片、读取图片、导出标注 PNG + JSON
- 可将标注产物上传 OSS（按任务路径结构生成 key）

9) Webhook 与自动清理
- 任务成功/失败触发 webhook
- 自动清理策略（仅清理指定来源任务，按 retentionDays）

【数据库设计】
至少包含表：
- tasks
- task_files（外键 tasks，ON DELETE CASCADE）
- ssh_machines
- settings
并包含必要索引与迁移逻辑（如增量增加 transfer_mode 字段）。

【进程与安全要求】
- preload + contextBridge 暴露有限 API
- renderer 不直接访问 Node API
- 主进程通过 IPC 统一处理业务
- contextIsolation=true, nodeIntegration=false
- 统一 shared/types.ts 与 shared/ipc-channels.ts

【前端页面】
- Dashboard：任务面板、扫描计划、磁盘用量、数采结果、任务卡片
- Settings：所有配置项+OSS测试+自动保存
- History：分页表格+单条删除+清空
- SSHMachines：机器管理、连接测试、拉取/直传触发
- Annotation：标注子应用（懒加载）

【项目结构要求】
按 main/preload/renderer/shared 分层组织，服务层（scanner/task-queue/task-runner/oss-upload/ssh-rsync/webhook/cleanup）清晰拆分，DB Repo 分离。

【打包要求】
- electron-builder 配置 Linux: AppImage + deb (x64)
- 可执行 npm run build:linux 产出 .deb
- 保证 better-sqlite3 原生模块可重建

【质量要求】
- 全量 TypeScript，无 any 滥用
- 关键逻辑有清晰错误处理和日志
- npm run typecheck 必须通过
- 提供 README：安装、开发、打包、常见问题
- 输出完整可运行代码，不要只给伪代码

现在开始执行：
1) 先生成完整项目目录和关键文件
2) 再逐模块实现
3) 每完成一个模块说明你创建/修改了哪些文件
4) 最后运行 typecheck 并给出构建命令