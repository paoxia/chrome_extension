# 网页内容总结器 Chrome 扩展

一个 Chrome 浏览器扩展，可以读取当前网页内容并使用本地 Ollama 进行智能总结。

## 功能特性

- 📖 自动提取网页主要内容
- 🤖 使用本地 Ollama 模型进行智能总结
- 🌐 支持所有网页（除 Chrome 内置页面）
- 🔍 自动检测并选择可用的 Ollama 模型
- ✅ 连接测试功能，方便排查问题

## 安装步骤

### 1. 安装 Ollama

首先确保你已经安装并运行了 Ollama：

- 访问 [Ollama 官网](https://ollama.ai/) 下载并安装
- 启动 Ollama 服务（默认运行在 `http://localhost:11434`）

### 2. 下载并安装模型

在终端中运行以下命令下载模型（选择一个或多个）：

```bash
# 推荐的中文模型
ollama pull qwen2.5:8b
# 或
ollama pull llama3.2:3b
# 或
ollama pull mistral:7b
```

### 3. 配置 Ollama 允许跨域请求

**重要：** 必须设置 `OLLAMA_ORIGINS` 环境变量，允许 Chrome 扩展访问 Ollama API。

#### Windows 系统

**方法一：通过系统环境变量设置（推荐）**

1. 右键点击"此电脑" → "属性"
2. 点击"高级系统设置"
3. 点击"环境变量"
4. 在"系统变量"中点击"新建"
5. 变量名：`OLLAMA_ORIGINS`
6. 变量值：`chrome-extension://*`
7. 点击"确定"保存
8. **重启 Ollama 服务**（重要！）

**方法二：通过命令行设置（临时）**

在启动 Ollama 之前，在 PowerShell 或 CMD 中运行：

```powershell
$env:OLLAMA_ORIGINS="chrome-extension://*"
ollama serve
```

#### macOS / Linux 系统

在终端中运行：

```bash
export OLLAMA_ORIGINS="chrome-extension://*"
ollama serve
```

或者将环境变量添加到 `~/.bashrc` 或 `~/.zshrc` 文件中：

```bash
echo 'export OLLAMA_ORIGINS="chrome-extension://*"' >> ~/.bashrc
source ~/.bashrc
```

然后重启 Ollama 服务。

#### 验证配置

设置完成后，重启 Ollama 服务，然后可以通过以下方式验证：

1. 在浏览器中访问 `http://localhost:11434/api/tags`，应该能看到模型列表
2. 使用扩展的"测试Ollama连接"功能，应该能成功连接

### 4. 安装 Chrome 扩展

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 开启右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择本项目的文件夹
6. 扩展安装完成

## 使用方法

1. **测试连接**（首次使用建议先测试）
   - 点击浏览器工具栏中的扩展图标
   - 点击"测试Ollama连接"按钮
   - 确认能看到可用模型列表

2. **总结网页内容**
   - 打开任意网页
   - 点击扩展图标
   - 点击"总结当前网页"按钮
   - 等待几秒钟，总结结果会显示在弹窗中

## 常见问题

### Q: 测试连接时显示 403 错误

**A:** 这通常是因为没有设置 `OLLAMA_ORIGINS` 环境变量。请按照上面的"配置 Ollama 允许跨域请求"步骤进行配置，并确保重启了 Ollama 服务。

### Q: 总结时显示"模型不存在"错误

**A:** 
1. 使用"测试Ollama连接"功能查看可用的模型列表
2. 确保至少下载了一个模型
3. 如果模型名称不正确，扩展会自动选择第一个可用模型

### Q: 显示"消息通道已关闭"错误

**A:**
1. 在 `chrome://extensions/` 页面重新加载扩展
2. 检查 Service Worker 是否正常运行
3. 打开 Service Worker 控制台查看详细错误信息

### Q: 无法连接到 Ollama 服务

**A:**
1. 确认 Ollama 服务正在运行（访问 `http://localhost:11434` 测试）
2. 检查防火墙是否阻止了连接
3. 确认 Ollama 运行在默认端口 11434

### Q: 总结结果不理想

**A:**
1. 尝试使用更大的模型（如 7B 或 8B 参数）
2. 确保网页内容已完全加载
3. 某些网页可能包含大量广告或无关内容，影响总结质量

## 技术说明

- **Manifest Version:** 3
- **Ollama API:** `http://localhost:11434/api/generate`
- **支持的模型:** 所有 Ollama 支持的模型（自动检测）

## 开发说明

### 项目结构

```
web_reader/
├── manifest.json      # 扩展配置文件
├── background.js      # Service Worker，处理与 Ollama 的通信
├── content.js         # Content Script，提取网页内容
├── popup.html         # 扩展弹窗界面
├── popup.js           # 弹窗逻辑
└── README.md          # 本文件
```

### 修改模型选择逻辑

如果需要修改模型选择逻辑，编辑 `background.js` 中的 `getAvailableModel()` 函数。

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

