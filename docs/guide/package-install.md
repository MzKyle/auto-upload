# 安装与打包

## Linux 打包

```bash
npm run build:linux
```

该命令会执行：

1. `electron-vite build`
2. 清理可能影响打包的 `node_modules/cpu-features`
3. 使用 `electron-builder --linux --x64` 生成 Linux 包
4. 重建 `better-sqlite3` 原生依赖

产物会输出到：

```text
dist/
```

常见产物包括 `.deb` 和 AppImage。

## Windows 打包

```bash
npm run build:win
```

如果需要同时打包 Linux 和 Windows：

```bash
npm run build:all
```

## 安装 deb 包

在 Ubuntu / Debian 系统中进入安装包所在目录：

```bash
sudo dpkg -i electron-uploader_2.0.1_amd64.deb
```

如果出现依赖缺失：

```bash
sudo apt-get update
sudo apt-get -f install -y
```

然后再次安装。

## 安装后验证

1. 从系统应用菜单启动应用。
2. 打开“设置”页，配置 OSS 并测试连接。
3. 添加扫描目录并触发扫描。
4. 上传一个小目录，确认 OSS 中出现对应对象。
5. 新增文件或新增子目录，验证后续扫描仍能继续上传。

## better-sqlite3 打包问题

如果 Linux 打包时报原生模块相关错误，可以先清理依赖后重装：

```bash
rm -rf node_modules package-lock.json
npm install
npm run build:linux
```

如果仍失败，检查当前 Node 版本、Electron 版本和本机编译工具链是否匹配。
