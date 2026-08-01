# Web Reader

一个基于 Chrome Manifest V3 的 AI 网页阅读助手。它可以总结当前页面，也可以把译文直接嵌入网页，并在原文、双语、译文三种显示状态之间切换。

## 功能

- 提取当前页面的主要文本并生成摘要
- 将标题、段落、列表项等正文块翻译后直接展示在原位置
- 支持原文、双语、译文三种显示模式，随时切换或移除译文
- 支持 OpenAI 兼容的 Chat Completions API
- 支持通过 Chrome Native Messaging 自动调用本机 Codex CLI，无需常驻服务
- 摘要和翻译在后台执行，关闭扩展弹窗后任务仍可继续
- 配置保存在 `chrome.storage.local`

## 安装

1. 打开 `chrome://extensions/`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择仓库中的 `web_reader` 目录。

修改代码后，需要在扩展管理页重新加载扩展，并刷新已经打开的目标网页。

## 连接本地 Codex（推荐）

Native Messaging 模式不需要手动启动后台服务。首次使用只需安装一次本地 Host：

1. 确认终端中运行 `codex --version` 和 `codex login status` 均正常。
2. 在 `chrome://extensions/` 打开 Web Reader 的详情，复制由 32 个字母组成的“扩展程序 ID”。
3. 根据系统安装 Native Host。

### Windows

在 PowerShell 中进入 `web_reader` 目录并运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\native_host\install-host.ps1 -ExtensionId 你的扩展ID
```

安装程序会在当前用户的 `%LOCALAPPDATA%\WebReaderCodexHost` 下编译本地 Host，并在 `HKCU` 注册 Chrome Native Messaging Host；不需要管理员权限。它会记录当前 `codex.cmd` 的位置，并且只允许指定的扩展 ID 调用。

Windows 卸载方式：

```powershell
powershell -ExecutionPolicy Bypass -File .\native_host\uninstall-host.ps1
```

### macOS / Linux

除了 Codex CLI，还需要 `node` 18 或更高版本。在终端中进入 `web_reader` 目录并运行：

```bash
chmod +x ./native_host/install-host.sh ./native_host/uninstall-host.sh
./native_host/install-host.sh 你的扩展ID chrome
```

第二个参数支持 `chrome`、`chromium`、`edge`、`brave` 或 `all`，省略时默认为 Chrome。脚本会把 Host 安装到当前用户目录，并将 Native Messaging manifest 注册到对应浏览器的用户配置目录，不需要 `sudo`。

macOS/Linux 卸载方式：

```bash
./native_host/uninstall-host.sh
```

4. 回到 `chrome://extensions/`，重新加载 Web Reader。
5. 打开扩展，将“AI 服务”切换为“本地 Codex（Native，推荐）”，点击“测试连接”。

如果扩展目录移动后扩展 ID 发生变化，重新运行对应安装命令并传入新的 ID 即可。

Native 模式每次任务由 Chrome 自动启动 Host，Host 再以只读、临时会话运行 `codex exec`。没有监听端口，也不需要保持终端窗口。

## 使用 OpenAI 兼容接口

将“AI 服务”切换为“OpenAI 兼容接口”，填写：

- API 地址，例如 `https://api.openai.com/v1`
- API Key；不需要鉴权的本地兼容服务可以留空
- 模型名称

扩展会使用 `/models` 测试连接，使用 `/chat/completions` 完成摘要和翻译。

## 页面翻译

1. 选择目标语言和默认展示方式。
2. 打开需要翻译的网页，点击“翻译当前页面”。
3. 翻译完成后，网页右下角会出现控制条。
4. 可在“原文”“双语”“译文”之间切换；点击关闭按钮或弹窗中的“移除译文”可恢复页面。

翻译不会覆盖服务器内容。扩展仅在当前页面 DOM 中包裹原文并插入译文；刷新页面或移除译文即可恢复。

## 注意事项

- Chrome 内置页、扩展商店等受保护页面不允许内容脚本运行。
- 动态加载的新段落不会自动翻译，需要重新执行页面翻译。
- 页面文本会发送给所选 AI 服务。Native Host 在本机调用 Codex CLI，但 Codex 仍会使用账户所配置的模型服务，因此“本地调用”不等于离线推理。
- 网页内容会被当作不可信输入；Codex 会在只读、禁用网络和无需审批的任务上下文中运行，且提示词要求它不要执行网页中的命令。
- 极复杂页面的原有排版可能因双语内容增加而发生轻微变化，移除译文即可还原。

## 项目结构

```text
web_reader/
├── manifest.json
├── background.js       # AI 服务连接、后台任务与结果管理
├── content.js          # 正文提取、译文插入与显示模式切换
├── content.css         # 页面内译文和控制条样式
├── popup.html
├── popup.js
├── native_host/
│   ├── WebReaderCodexHost.cs # Native Messaging Host 源码
│   ├── native-host.js        # macOS/Linux Native Host
│   ├── install-host.ps1      # Windows 当前用户安装脚本
│   ├── uninstall-host.ps1    # Windows 卸载脚本
│   ├── install-host.sh       # macOS/Linux 当前用户安装脚本
│   └── uninstall-host.sh     # macOS/Linux 卸载脚本
├── icon.png
└── README.md
```

## 许可

MIT License
