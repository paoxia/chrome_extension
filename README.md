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

Bilibili 稍后观看批量管理工具：从关注的 UP 主动态中拉取近两天的视频，一键加入稍后观看。

**主要功能：**
- 📊 自动统计关注 UP 主两天内更新的视频数量并显示在弹窗
- ⏰ 一键将这些视频批量加入稍后观看
- ▶ 快速跳转到稍后观看播放页 / 列表页
- 📝 实时显示每一步操作日志（成功 / 失败可视化区分）

**使用场景：**
- 不想错过关注 UP 主的更新，又懒得逐个手动点"稍后再看"
- 习惯用稍后观看作为统一的播放队列连续观看

**技术特点：**
- 使用 Manifest V3
- 通过 Bilibili Web 动态 feed API（`/x/polymer/web-dynamic/v1/feed/all`）抓取关注流，并按发布时间过滤
- 使用 `declarativeNetRequest` 静态规则改写 `toview/add` 请求的 `Origin` / `Referer`，解决 Service Worker 中 fetch 对受限请求头无法直接设置的问题
- 复用浏览器中已登录的 Bilibili cookie（`SESSDATA` / `bili_jct`），无需额外登录

---

### 4. 视频下载助手 (video_downloader)

提取页面视频链接，支持迅雷下载。

**主要功能：**
- 🔍 自动扫描页面中的视频资源
- 📋 显示检测到的视频列表（格式、大小）
- ⚡ 支持迅雷下载协议
- 📦 支持批量下载

**使用场景：**
- 下载网页中的视频资源
- 批量获取视频链接

**技术特点：**
- 使用 Manifest V3
- 支持多种视频格式检测（mp4、m3u8、webm 等）
- 迅雷协议调用

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
│   └── icon.png             # 扩展图标
│
├── bilibili_helper/         # Bilibili 助手
│   ├── manifest.json        # 扩展配置文件
│   ├── background.js        # Service Worker
│   ├── content.js           # Content Script
│   ├── popup.html           # 弹窗界面
│   ├── popup.js             # 弹窗逻辑
│   ├── rules.json           # declarativeNetRequest 请求头改写规则
│   └── icon.png             # 扩展图标
│
├── video_downloader/        # 视频下载助手
│   ├── manifest.json        # 扩展配置文件
│   ├── background.js        # Service Worker
│   ├── content.js           # Content Script
│   ├── popup.html           # 弹窗界面
│   ├── popup.js             # 弹窗逻辑
│   ├── style.css            # 样式文件
│   └── icon.png             # 扩展图标
│
├── .harness/                # 任务管理
│   ├── Agent.md             # Agent 工作流程
│   ├── todo/                # 待办任务
│   └── executed/            # 已完成任务
│
├── .gitignore               # Git 忽略配置
├── LICENSE                  # 许可证文件
└── README.md                # 本文件
```

---

## 🔧 技术栈

- **Chrome Extension Manifest V3**
- **JavaScript (ES6+)**
- **Chrome APIs**: `declarativeNetRequest`, `storage`, `tabs`, `activeTab`, `alarms`, `notifications`, `scripting`

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
