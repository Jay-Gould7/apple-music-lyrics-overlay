# Apple Music Floating Lyrics

一个用于 Windows 桌面的 Apple Music 悬浮歌词小工具。

## 项目缘由

Apple Music Windows 客户端目前没有类似桌面歌词、歌词弹幕或悬浮歌词的展示方式。这个小工具通过系统媒体信息读取当前播放歌曲，并在桌面上显示实时同步歌词，让你在使用其他软件时也能看到 Apple Music 当前歌曲的歌词。

需要注意的是，工具不会直接读取 Apple Music 内置歌词，也不会使用 Apple Music 私有接口。歌词来自第三方歌词服务，因此部分歌曲可能会因为曲名、歌手名、版本信息或歌词库缺失而检索不到。

## 功能特性

- 通过 Windows SMTC 读取当前系统媒体播放信息。
- 优先识别 Apple Music 播放会话。
- 支持读取歌曲名、歌手、专辑、播放状态、播放进度和歌曲时长。
- 通过 LRCLIB 检索 LRC 格式同步歌词。
- 解析 LRC 时间轴并高亮当前歌词。
- 本地缓存歌词查询结果，减少重复请求。
- 透明、无边框、置顶的桌面悬浮歌词窗口。
- 默认只显示歌词，鼠标悬停时显示设置面板。
- 支持调整主歌词颜色、副歌词颜色和字号。
- 支持自定义窗口大小。
- 支持锁定穿透，避免影响鼠标操作其他窗口。
- 支持托盘菜单和全局快捷键恢复交互。

## 技术栈

- React
- TypeScript
- Vite
- Electron
- Windows System Media Transport Controls
- PowerShell WinRT bridge
- LRCLIB synced lyrics API

## 环境要求

- Windows 10 / Windows 11
- Node.js 18+ 或 Node.js 22+
- PowerShell 5.1+
- Apple Music Windows 客户端

## 安装依赖

```powershell
npm install
```

## 开发模式运行

```powershell
npm run desktop:dev
```

## 构建检查

```powershell
npm run build
```

## 使用已构建前端启动桌面端

```powershell
npm run desktop:start
```

## 构建桌面端资源

```powershell
npm run desktop:build
```

## 使用方式

1. 打开 Apple Music 并播放歌曲。
2. 启动本工具。
3. 工具会自动读取当前播放歌曲并检索同步歌词。
4. 悬浮窗口默认只显示歌词。
5. 鼠标移到歌词区域时显示设置面板。
6. 点击 `锁定穿透` 后，窗口会忽略鼠标操作。

## 快捷键

- `Ctrl + Shift + L`：解锁穿透并显示设置面板。
- `Ctrl + Shift + M`：显示或隐藏设置面板。
- `Esc`：关闭设置面板；锁定状态下可尝试恢复交互。

## 托盘菜单

系统托盘菜单提供以下操作：

- `显示窗口`
- `显示设置`
- `解锁穿透`
- `退出`

如果窗口被锁定或看不到设置面板，可以通过托盘菜单或全局快捷键恢复。

## 歌词来源与限制

- 工具不会读取 Apple Music 内置歌词。
- 工具使用 LRCLIB 进行第三方同步歌词匹配。
- 部分歌曲可能检索不到歌词。
- 不同版本的歌曲可能存在时间轴偏移。
- Apple Music 返回的歌手字段有时会混入专辑或单曲信息，可能影响匹配准确率。
- 网络不可用或 LRCLIB 服务不可达时，歌词加载会失败。

## 常见问题

### 只有歌词，看不到设置面板

按：

```text
Ctrl + Shift + L
```

或：

```text
Ctrl + Shift + M
```

也可以从系统托盘菜单选择 `显示设置`。

### 锁定后无法点击窗口

这是锁定穿透模式的预期行为。使用以下方式恢复：

```text
Ctrl + Shift + L
```

或从托盘菜单选择 `解锁穿透`。

### 歌词不同步

目前内置了固定同步补偿。不同歌曲、不同歌词源可能仍会有轻微偏移。

### 检索不到歌词

可能原因：

- LRCLIB 没有该歌曲歌词。
- Apple Music 返回的歌名或歌手名包含版本后缀。
- 当前播放的是 Live、Remix、伴奏或特殊版本。
- 歌曲 metadata 与歌词库记录不一致。

## 后续改进建议

- 有建议可以提，目前还没有上下首播放按钮。
