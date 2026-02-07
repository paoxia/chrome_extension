# Chrome 浏览器扩展集合

本项目包含两个实用的 Chrome 浏览器扩展，帮助您提高工作效率和浏览体验。

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

### 2. 网页内容总结器 (web_reader)

一个智能的网页内容总结工具，使用本地 Ollama AI 模型对网页内容进行智能总结，帮助您快速了解文章要点。

**主要功能：**
- 📖 自动提取网页主要内容
- 🤖 使用本地 Ollama 模型进行智能总结
- 🌐 支持所有网页（除 Chrome 内置页面）
- 🔍 自动检测并选择可用的 Ollama 模型
- ✅ 连接测试功能，方便排查问题
- 🔒 完全本地运行，保护隐私

**使用场景：**
- 快速了解长篇文章的核心内容
- 阅读新闻时快速获取要点
- 研究资料时提取关键信息
- 节省阅读时间，提高信息获取效率

**技术特点：**
- 使用 Manifest V3
- 集成本地 Ollama AI 服务
- 支持多种 AI 模型（qwen2.5、llama3.2、mistral 等）
- 完全离线运行，数据不出本地

---

## 🚀 快速开始

### 安装网站屏蔽工具

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `block_site` 文件夹
6. 扩展安装完成！

**使用方法：**
- 访问想要屏蔽的网站
- 点击扩展图标
- 点击"屏蔽当前网站"按钮
- 网站将被立即屏蔽，无法访问

### 安装网页内容总结器

#### 前置要求

1. **安装 Ollama**
   - 访问 [Ollama 官网](https://ollama.ai/) 下载并安装
   - 启动 Ollama 服务（默认运行在 `http://localhost:11434`）

2. **下载 AI 模型**
   ```bash
   # 推荐的中文模型
   ollama pull qwen2.5:8b
   # 或
   ollama pull llama3.2:3b
   # 或
   ollama pull mistral:7b
   ```

3. **配置 Ollama 允许跨域请求**

   **Windows 系统：**
   - 方法一（推荐）：设置系统环境变量
     1. 右键"此电脑" → "属性" → "高级系统设置" → "环境变量"
     2. 在"系统变量"中新建：变量名 `OLLAMA_ORIGINS`，变量值 `chrome-extension://*`
     3. 重启 Ollama 服务
   
   - 方法二（临时）：在 PowerShell 中运行
     ```powershell
     $env:OLLAMA_ORIGINS="chrome-extension://*"
     ollama serve
     ```

   **macOS / Linux 系统：**
   ```bash
   export OLLAMA_ORIGINS="chrome-extension://*"
   ollama serve
   ```

#### 安装扩展

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择 `web_reader` 文件夹
6. 扩展安装完成！

**使用方法：**
1. 首次使用建议先点击"测试Ollama连接"确认配置正确
2. 打开任意网页
3. 点击扩展图标
4. 点击"总结当前网页"按钮
5. 等待几秒钟，总结结果会显示在弹窗中

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
│   └── rules.json           # 屏蔽规则配置
│
├── web_reader/              # 网页内容总结器
│   ├── manifest.json        # 扩展配置文件
│   ├── background.js        # Service Worker，处理与 Ollama 的通信
│   ├── content.js           # Content Script，提取网页内容
│   ├── popup.html           # 扩展弹窗界面
│   ├── popup.js             # 弹窗逻辑
│   ├── images/              # 图标资源
│   └── README.md            # 详细使用说明
│
├── LICENSE                  # 许可证文件
└── README.md                # 本文件
```

---

## 🔧 技术栈

- **Chrome Extension Manifest V3**
- **JavaScript (ES6+)**
- **Chrome APIs**: `declarativeNetRequest`, `storage`, `tabs`, `activeTab`
- **Ollama AI** (仅 web_reader 使用)

---

## ❓ 常见问题

### 网站屏蔽工具

**Q: 屏蔽后如何恢复访问？**  
A: 点击扩展图标，在"已屏蔽网站"列表中找到对应网站，点击"移除屏蔽"按钮。

**Q: 屏蔽列表会丢失吗？**  
A: 不会，屏蔽列表保存在 Chrome 本地存储中，重启浏览器后依然有效。

### 网页内容总结器

**Q: 测试连接时显示 403 错误？**  
A: 这是因为没有设置 `OLLAMA_ORIGINS` 环境变量。请按照安装步骤中的"配置 Ollama 允许跨域请求"部分进行配置，并确保重启了 Ollama 服务。

**Q: 总结结果不理想？**  
A: 可以尝试使用更大的模型（如 7B 或 8B 参数），确保网页内容已完全加载，某些网页可能包含大量广告或无关内容，影响总结质量。

更多问题请查看 [web_reader/README.md](web_reader/README.md)

---

## 📝 许可证

MIT License

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📧 联系方式

如有问题或建议，欢迎通过 GitHub Issues 反馈。

