# Chrome 浏览器扩展集合

本项目包含多个实用的 Chrome 浏览器扩展，帮助您提高工作效率和浏览体验。

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

一个智能的网页内容总结工具，使用 OpenAI 兼容的 API 对网页内容进行智能总结，帮助您快速了解文章要点。

**主要功能：**
- 📖 自动提取网页主要内容
- 🤖 支持 OpenAI 风格的 API（OpenAI、Azure、第三方代理等）
- 🌐 支持所有网页（除 Chrome 内置页面）
- ⚙️ 可配置 API 地址、密钥和模型
- 🔄 后台处理，关闭弹窗也能继续运行
- ✅ 连接测试功能，方便排查问题

**使用场景：**
- 快速了解长篇文章的核心内容
- 阅读新闻时快速获取要点
- 研究资料时提取关键信息
- 节省阅读时间，提高信息获取效率

**技术特点：**
- 使用 Manifest V3
- 支持 OpenAI 兼容的 API 接口
- 配置信息本地存储，保护隐私

---

### 3. Bilibili 助手 (bilibili_helper)

Bilibili 稍后观看批量管理工具：从关注的 UP 主动态中拉取自定义时间范围内的视频，一键加入稍后观看。

**主要功能：**
- 📊 自动统计关注 UP 主在指定范围内更新的视频数量并显示在弹窗
- ⏰ 一键将这些视频批量加入稍后观看
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
- 通过 `options_ui`（嵌入式弹层）独立呈现设置，弹窗界面保持简洁
- 设置变更后通过 `chrome.storage.onChanged` 实时同步弹窗的计数和文案

---

### 4. 工作流倒计时 (workflow_timer)

支持多步骤工作流的倒计时工具，按顺序执行一组定时任务，配合系统通知提醒切换步骤。

**主要功能：**
- ⏱ 自定义多步骤工作流（每步可设独立时长）
- 🔔 步骤切换时系统通知提醒
- 🔁 通过 `chrome.alarms` 在后台精确驱动倒计时，关闭弹窗仍正常运行
- 🔊 借助 offscreen 文档播放提示音（突破 Service Worker 不能直接播放音频的限制）

**使用场景：**
- 番茄钟与变种节奏（专注 + 休息 + 长休息）
- 健身组间训练计时
- 学习/写作分段计时

**技术特点：**
- 使用 Manifest V3
- `chrome.alarms` + `chrome.notifications` 实现可靠的后台调度与提醒
- 使用 Offscreen API 处理音频播放
- 状态保存在 `chrome.storage`，浏览器重启后可恢复

---

### 5. 网页媒体下载器 (media_downloader)

在一个扩展中统一检测和下载网页视频、图片，通过标签页快速切换两类资源。

**主要功能：**
- 🎬 视频模式：通过 `webRequest` 和页面扫描检测视频，可按大小过滤并编辑文件名
- ⚡ 视频可选择浏览器或迅雷下载，并向迅雷传递文件名、大小和来源页面信息
- 🖼️ 图片模式：扫描 `<img>`、`srcset`、CSS 背景图、链接、脚本和 HTML 中的图片地址
- 📊 图片支持按 KB 过滤、隐藏未知大小，并在缩略图上显示文件大小
- 📁 支持 MP4、WebM、MKV、AVI、MOV、FLV、WMV、OGG、M3U8 及常见图片格式
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
- 针对 Twitter 图片自动添加 `Referer` / `User-Agent` 请求头
- 视频和图片信息分别存储在 `chrome.storage.local`，1小时后自动清理

---

## 🚀 快速开始

### 安装扩展

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择对应的扩展文件夹
6. 扩展安装完成！

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
│   ├── background.js        # Service Worker（alarms 调度）
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
├── .gitignore               # Git 忽略配置（含 _metadata/）
├── LICENSE                  # 许可证文件
└── README.md                # 本文件
```

---

## 🔧 技术栈

- **Chrome Extension Manifest V3**
- **JavaScript (ES6+)**
- **Chrome APIs**: `declarativeNetRequest`, `storage`, `cookies`, `tabs`, `activeTab`, `alarms`, `notifications`, `scripting`, `offscreen`, `downloads`, `webRequest`

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
