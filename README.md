# Chrome 浏览器扩展集合

本项目包含 6 个独立的 Chrome Manifest V3 扩展，覆盖网站屏蔽、AI 阅读、稍后观看管理、工作流计时、媒体下载和喝水提醒。各扩展可单独安装，无需构建。

| 扩展 | 目录 | 当前版本 | 核心功能 |
| --- | --- | --- | --- |
| 网站屏蔽工具 | [`block_site`](block_site/) | 1.0.0 | 屏蔽当前网站并管理屏蔽列表 |
| AI 阅读器 | [`web_reader`](web_reader/README.md) | 2.0.0 | 网页摘要、页面内翻译、OpenAI 兼容接口与本机 Codex |
| Bilibili 助手 | [`bilibili_helper`](bilibili_helper/) | 1.1.0 | 批量加入稍后观看，自动跳过已添加视频 |
| 工作流倒计时 | [`workflow_timer`](workflow_timer/) | 1.0.0 | 多步骤计时、系统通知与提示音 |
| 网页媒体下载器 | [`media_downloader`](media_downloader/) | 2.1.0 | 视频与图片检测、图片批量下载、迅雷下载 |
| 喝水提醒 | [`water_reminder`](water_reminder/README.md) | 1.2.0 | 饮水确认、5 分钟催促、剩余计划重排与网页动画 |

## 📦 扩展列表

### 1. 网站屏蔽工具 (block_site)

一个简单高效的网站屏蔽工具，帮助您在工作或学习时屏蔽干扰网站，提高专注力。

**主要功能：**
- 🚫 一键屏蔽当前访问的网站
- 📋 管理已屏蔽网站列表
- 🔄 快速移除屏蔽，恢复网站访问
- 💾 自动保存屏蔽列表，重启浏览器后依然有效
- ⚡ 使用 Chrome 原生 API，性能优异

**使用场景：**
- 工作期间屏蔽社交媒体网站
- 学习时屏蔽娱乐网站
- 防止访问特定网站，培养良好习惯

**技术特点：**
- 使用 Manifest V3
- 基于 `declarativeNetRequest` API 实现网络请求拦截
- 无需后台常驻，资源占用低

---

### 2. AI 阅读器 (web_reader)

一个支持网页总结和页面内翻译的 AI 阅读助手，可使用 OpenAI 兼容 API，也可通过 Native Messaging 调用本机 Codex CLI。

**主要功能：**
- 📖 自动提取网页主要内容并生成摘要
- 🌏 将译文直接嵌入网页，支持原文、双语、译文三种状态切换
- 🤖 支持提供 `/models` 和 `/chat/completions` 的 OpenAI 兼容接口
- 💻 支持 Windows、macOS、Linux 上通过 Chrome Native Messaging 自动调用本地 Codex CLI，无需常驻服务
- 🌐 支持普通网页，Chrome 内置页、扩展商店等受保护页面除外
- ⚙️ 可配置 AI 服务、模型、目标语言和默认翻译模式
- 🔄 后台处理，关闭弹窗也能继续运行
- ✅ 连接测试功能，方便排查问题

**使用场景：**
- 快速了解长篇文章的核心内容
- 双语阅读外文文章或切换为纯译文阅读
- 阅读新闻时快速获取要点
- 研究资料时提取关键信息
- 节省阅读时间，提高信息获取效率

**技术特点：**
- 使用 Manifest V3
- 支持 OpenAI 兼容的 API 接口
- 支持一次安装、按需启动的 Codex Native Messaging Host
- 页面译文以 DOM 增强方式展示，可随时移除并恢复原文
- 配置信息本地存储，保护隐私

首次使用需配置 AI 服务；选择本机 Codex 时还需安装 Native Host。安装命令、系统依赖及页面翻译说明详见 [AI 阅读器说明](web_reader/README.md)。网页文本会发送到所选模型服务，本机调用 Codex 仍需连接模型服务。

---

### 3. Bilibili 助手 (bilibili_helper)

Bilibili 稍后观看批量管理工具：从关注的 UP 主动态中拉取自定义时间范围内的视频，一键加入稍后观看。

**主要功能：**
- 📊 自动统计关注 UP 主在指定范围内更新的视频数量并显示在弹窗
- ⏰ 一键将这些视频批量加入稍后观看
- ♻️ 自动跳过本地记录或当前稍后观看列表中已经添加过的视频
- ⚙️ 独立的嵌入式设置页（齿轮入口），可自定义时间范围（1-30 小时 / 天）
- 💾 设置持久化保存（chrome.storage.local），跨会话生效
- ▶ 快速跳转到稍后观看播放页 / 列表页
- 📝 实时显示每一步操作日志（成功 / 失败可视化区分）

**使用场景：**
- 不想错过关注 UP 主的更新，又懒得逐个手动点"稍后再看"
- 习惯用稍后观看作为统一的播放队列连续观看
- 根据观看节奏自由调整范围（如每天清单 24h / 周末批量补 7 天）

**技术特点：**
- 使用 Manifest V3
- 通过 Bilibili Web 动态 feed API（`/x/polymer/web-dynamic/v1/feed/all`）抓取关注流，并按发布时间过滤
- 使用 `declarativeNetRequest` 静态规则改写 `toview/add` 请求的 `Origin` / `Referer`，解决 Service Worker 中 fetch 对受限请求头无法直接设置的问题
- 复用浏览器中已登录的 Bilibili cookie（`SESSDATA` / `bili_jct`），无需额外登录
- 按 Bilibili 账号持久化成功添加的 AID；记录保留 32 天且每个账号最多 5000 条，避免无限增长
- 远端稍后观看列表不可用时自动退回本地记录去重，不影响正常添加
- 通过 `options_ui`（嵌入式弹层）独立呈现设置，弹窗界面保持简洁
- 设置变更后通过 `chrome.storage.onChanged` 实时同步弹窗的计数和文案

---

### 4. 工作流倒计时 (workflow_timer)

支持多步骤工作流的倒计时工具，为各步骤设置时长，配合系统通知提醒切换步骤。

**主要功能：**
- ⏱ 自定义多步骤工作流（每步可设独立时长）
- 🔔 步骤切换时系统通知提醒
- 🔁 后台 Service Worker 维护倒计时，弹窗打开时同步显示进度
- 🔊 借助 offscreen 文档播放提示音（突破 Service Worker 不能直接播放音频的限制）

**使用场景：**
- 番茄钟与变种节奏（专注 + 休息 + 长休息）
- 健身组间训练计时
- 学习/写作分段计时

**技术特点：**
- 使用 Manifest V3
- 使用 `setInterval` 更新倒计时，通过 `chrome.notifications` 发送完成通知
- 使用 Offscreen API 处理音频播放
- 状态保存在 `chrome.storage.local`，后台重新启动后读取已保存的剩余秒数

当前实现按秒递减，Service Worker 休眠、浏览器退出或电脑休眠可能使计时停滞；恢复时不会扣除停机期间经过的时间。

---

### 5. 网页媒体下载器 (media_downloader)

在一个扩展中统一检测和下载网页视频、图片，通过标签页快速切换两类资源。

**主要功能：**
- 🎬 视频模式：通过 `webRequest` 和页面扫描检测视频，可按大小过滤并编辑文件名
- ⚡ 视频可选择浏览器或迅雷下载，并向迅雷传递文件名、大小和来源页面信息
- 🖼️ 图片模式：扫描 `<img>`、`srcset`、CSS 背景图、链接、脚本和 HTML 中的图片地址
- 📊 图片支持按 KB 过滤、隐藏未知大小，并在缩略图上显示文件大小
- ✅ 图片支持多选、全选当前过滤结果和批量下载，并保留单张点击下载
- 📁 检测 MP4、WebM、MKV、AVI、MOV、FLV、WMV、OGG、M3U8 等视频资源地址及常见图片格式
- 🔁 页面导航时自动清理旧资源，视频和图片过滤设置分别持久化保存

**使用场景：**
- 下载在线课程视频
- 保存社交媒体上的视频和高清图片
- 过滤占位图、小图标后收集设计素材
- 抓取网页视频、直播回放和页面图片资源

**技术特点：**
- 使用 Manifest V3
- 通过 `webRequest.onCompleted` 和 `webRequest.onBeforeRequest` 双重拦截检测视频请求
- 使用 `chrome.downloads` API 实现文件下载
- 通过迅雷客户端本机任务接口创建带自定义文件名的下载任务
- 两个独立 Content Script 分别负责视频和图片扫描，避免检测逻辑互相干扰
- Service Worker 利用 `host_permissions: <all_urls>` 跨域 `fetch` 获取图片大小（优先 `Content-Length` 头，缺失则回退读取 `blob.size`），并以 4 路并发异步填充
- Twitter 图片使用浏览器原生下载流程，避免受限请求头导致任务创建失败
- 视频和图片信息分别存储在 `chrome.storage.local`，后台恢复缓存时过滤超过 1 小时的记录

使用迅雷下载前需安装并运行迅雷客户端，目前仅支持 HTTP / HTTPS 视频地址。检测到 M3U8 地址不代表会自动合并视频分片。

---

### 6. 喝水提醒 (water_reminder)

设置每日饮水目标和提醒时段，按 30 分钟间隔安排饮水；每杯喝完后手动确认，未确认时每 5 分钟再次提醒，并动态重排剩余计划。

**主要功能：**
- 💧 自定义每日总饮水量（ml）、开始时间和结束时间
- 🔔 初始计划从开始时间 30 分钟后提醒，自动均分总量；结束时间不在休息段内时，末次对齐结束时间
- 🌙 支持跨午夜时段，每天重复提醒
- 💤 可设置多段不喝水的休息时间，自动跳过并重新分配目标总量
- 💦 可选哆啦 A 梦喝水动画，显示本次饮水量，手动确认后关闭
- ✅ 在系统通知、插件面板或网页动画中确认已喝完；只有确认后才计入饮水量
- 🔁 未确认每 5 分钟催促同一杯，水量不累加；确认后以实际确认时间重新安排下一杯
- 📋 预览完整计划、下一次提醒时间及本次应喝水量
- ⏸ 暂停 / 恢复提醒，提供测试通知
- 💾 本地保存设置，关闭弹窗继续运行，浏览器重启后恢复计划

**技术特点：**
- 使用 Manifest V3 与 `chrome.alarms`、`chrome.notifications`
- 网页访问权限按需授权，用于显示动画；无需读取网页内容或联网
- 休眠恢复后同一杯最多补一次提醒，不集中补发多杯；Chrome 完全退出或电脑休眠期间无法通知
- 到结束时间停止催促，未确认水量不会自动计入，也不会叠加到下一天

需要 Chrome 116 或更新版本。默认目标为 **2000 ml，09:00–18:00**，网页动画默认关闭。安装、确认方式、休息时段和分配规则详见 [喝水提醒说明](water_reminder/README.md)。

---

## 🚀 快速开始

### 安装扩展

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择对应的扩展文件夹
6. 扩展安装完成！

每次只选择一个包含 `manifest.json` 的扩展目录，例如 `water_reminder`，不要选择仓库根目录。可重复操作安装其他扩展。

### 首次使用

- **网站屏蔽工具**：打开目标网站，在扩展弹窗中添加屏蔽；移除后可恢复访问。
- **AI 阅读器**：配置 OpenAI 兼容接口，或按[子模块说明](web_reader/README.md)安装本机 Codex Native Host，再测试连接。
- **Bilibili 助手**：先在浏览器中登录 Bilibili，再从齿轮入口设置时间范围并批量加入稍后观看。
- **工作流倒计时**：创建工作流和各步骤时长，启动计时，并允许 Chrome 显示系统通知。
- **网页媒体下载器**：打开目标网页，切换视频 / 图片标签查看资源；使用迅雷时先启动客户端。
- **喝水提醒**：设置目标、时段和休息时间，点击「保存提醒计划」，用「发送测试通知」验证提醒。开启网页动画时需授予网页访问权限。

### 更新扩展

更新代码后，在 `chrome://extensions/` 点击对应扩展的重新加载按钮。涉及网页脚本或样式的更新，还需刷新目标网页。

---

## 📁 项目结构

```
chrome_extension/
├── block_site/              # 网站屏蔽工具
│   ├── manifest.json        # 扩展配置文件
│   ├── background.js        # Service Worker
│   ├── popup.html           # 弹窗界面
│   ├── popup.js             # 弹窗逻辑
│   ├── style.css            # 样式文件
│   ├── rules.json           # 屏蔽规则配置
│   └── icon.png             # 扩展图标
│
├── web_reader/              # AI 阅读器
│   ├── manifest.json        # 扩展配置文件
│   ├── background.js        # Service Worker
│   ├── content.js           # Content Script
│   ├── content.css          # 页面内翻译样式和模式控制条
│   ├── native_host/         # 本地 Codex Native Messaging Host 与安装脚本
│   ├── popup.html           # 弹窗界面
│   ├── popup.js             # 弹窗逻辑
│   ├── README.md            # 子模块说明
│   └── icon.png             # 扩展图标
│
├── bilibili_helper/         # Bilibili 助手
│   ├── manifest.json        # 扩展配置文件
│   ├── background.js        # Service Worker
│   ├── content.js           # Content Script
│   ├── popup.html           # 弹窗界面
│   ├── popup.js             # 弹窗逻辑
│   ├── options.html         # 嵌入式设置页
│   ├── options.js           # 设置页逻辑
│   ├── rules.json           # declarativeNetRequest 请求头改写规则
│   └── icon.png             # 扩展图标
│
├── workflow_timer/          # 工作流倒计时
│   ├── manifest.json        # 扩展配置文件
│   ├── background.js        # Service Worker（按秒计时与通知）
│   ├── popup.html           # 弹窗界面
│   ├── popup.js             # 弹窗逻辑
│   ├── offscreen.html       # Offscreen 文档（音频播放载体）
│   ├── offscreen.js         # Offscreen 文档逻辑
│   ├── style.css            # 样式文件
│   └── icon.png             # 扩展图标
│
├── media_downloader/        # 网页媒体下载器（视频 + 图片）
│   ├── manifest.json        # 扩展配置文件
│   ├── background.js        # Service Worker（视频检测 / 下载 / 迅雷）
│   ├── image-background.js  # 图片存储 / 大小获取 / 下载
│   ├── content.js           # 视频页面扫描
│   ├── image-content.js     # 图片多源页面扫描
│   ├── popup.html           # 视频 / 图片统一标签页界面
│   ├── popup.js             # 视频界面及标签切换逻辑
│   ├── image-popup.js       # 图片过滤和缩略图逻辑
│   └── icon.png             # 扩展图标
│
├── water_reminder/          # 喝水提醒
│   ├── manifest.json        # 扩展配置文件
│   ├── background.js        # Service Worker 事件入口
│   ├── controller.mjs       # 后台调度、饮水确认、催促与恢复
│   ├── schedule.mjs         # 时间与饮水量分配
│   ├── animation.mjs        # 哆啦 A 梦喝水动画与按需注入
│   ├── popup.html           # 弹窗界面
│   ├── popup.js             # 设置和计划预览
│   ├── style.css            # 样式文件
│   ├── icons/               # 水滴图标
│   ├── assets/              # 透明哆啦 A 梦角色插画
│   ├── tests/               # Node.js 自动测试
│   └── README.md            # 安装与使用说明
│
├── .gitignore               # Git 忽略配置（含 _metadata/）
├── LICENSE                  # 许可证文件
└── README.md                # 本文件
```

---

## 🔧 技术栈

- **Chrome Extension Manifest V3**
- **JavaScript (ES6+)**
- **Chrome APIs**: `declarativeNetRequest`, `storage`, `cookies`, `tabs`, `activeTab`, `alarms`, `notifications`, `scripting`, `offscreen`, `downloads`, `webRequest`, `nativeMessaging`
- **可选本机组件**：Codex CLI 与 Native Messaging Host（AI 阅读器）、迅雷客户端（视频迅雷下载）

---

## 🧪 开发验证

喝水提醒包含无需第三方依赖的自动测试。在仓库根目录使用 Node.js 18 或更新版本执行：

```sh
node --test water_reminder/tests/*.test.mjs
```

测试覆盖时间与水量分配、跨午夜、多段休息、饮水确认去重、5 分钟催促、计划重排、暂停恢复及动画兜底。其余扩展可通过加载已解压扩展，在目标网页中手动验证对应功能。

---

## 🎨 设计风格

所有扩展均采用苹果风格设计：
- 简洁优雅的界面
- 统一的配色方案
- 流畅的交互动画
- 清晰的视觉层次

---

## 📝 许可证

MIT License

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📧 联系方式

如有问题或建议，欢迎通过 GitHub Issues 反馈。
