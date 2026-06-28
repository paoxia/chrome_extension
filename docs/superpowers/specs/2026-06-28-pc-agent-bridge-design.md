# PC Agent Bridge — 设计文档

**日期**：2026-06-28
**模块名**：`pc_agent_bridge`（与 `bilibili_helper` 等同级的独立 Chrome 扩展）
**核心目标**：让本地 PC agent（LLM 驱动）通过 WebSocket 操控 Chrome 中一个专用 tab，实现 AI 驱动的网页自动化。

---

## 1. 总体架构

```
┌─────────────────────┐    WebSocket    ┌──────────────────────────────────┐
│  Local PC Agent     │ ◄────────────► │  Chrome Extension                │
│  (LLM driver)       │  ws://127.0.0.1│                                  │
└─────────────────────┘   :<port>      │  ┌─────────────────────────────┐ │
                                       │  │ Service Worker (background) │ │
                                       │  │  - WS 客户端 + 断线重连     │ │
                                       │  │  - 会话/Tab 状态机          │ │
                                       │  │  - screenshot / navigate    │ │
                                       │  └──────────┬──────────────────┘ │
                                       │             │ chrome.scripting   │
                                       │  ┌──────────▼──────────────────┐ │
                                       │  │ Content Script (agent tab)  │ │
                                       │  │  - DOM 操作（click/type）   │ │
                                       │  │  - 元素扫描 + 编号叠加      │ │
                                       │  └─────────────────────────────┘ │
                                       │  ┌─────────────────────────────┐ │
                                       │  │ Popup UI                    │ │
                                       │  │  - 连接状态、日志、断开    │ │
                                       │  └─────────────────────────────┘ │
                                       └──────────────────────────────────┘
```

三个进程边界，各司其职：

- **Service Worker**：唯一的 WS 端点；持有会话状态；分发指令到 content script 或自行执行（截屏、navigate、tab 管理）。
- **Content Script**：只在 agent tab 中存在；执行 DOM 级操作与编号标注。
- **Popup UI**：纯展示，从 SW 读状态，不参与指令路径。

---

## 2. 连接生命周期与会话模型

### 2.1 WebSocket（Service Worker 侧）

- 默认配置 `ws://127.0.0.1:8765`，host/port 可在 popup 修改，存 `chrome.storage.local`。
- 出于安全，只允许 host = `127.0.0.1` 或 `localhost`，其他值拒绝保存。
- 启动时机：扩展加载、浏览器启动（`chrome.runtime.onStartup`）、配置变更时立即重连。
- 重连：指数退避 1s → 2s → 5s → 10s（封顶 10s），无限重试。
- 心跳：每 20s 发 `{type:'ping'}`；60s 内无响应则关闭并重连。
- MV3 SW 空闲会被回收，使用 `chrome.alarms`（30s 周期）保持唤醒。

### 2.2 会话状态机

```
  IDLE ──[agent: open_session]──► RUNNING ──[close / tab_closed / disconnect]──► IDLE
```

- `open_session{ url? }`:
  1. `chrome.tabs.create({ url: url || 'about:blank' })`
  2. 等待 `chrome.tabs.onUpdated` 的 `status === 'complete'`
  3. `chrome.scripting.executeScript` 注入 `content.js`
  4. 返回 `{ tabId, sessionId }`
- 任意时刻只允许一个会话。RUNNING 期间收到第二个 `open_session` 返回 `session_busy`。
- 关闭路径三种：
  - agent `close_session` → SW 关闭 tab → 回 IDLE
  - 用户点 popup "断开" → 关闭 tab → 同上
  - 用户手动关闭 agent tab → `chrome.tabs.onRemoved` → 发 `session_closed{reason:'tab_closed'}` 事件 → 回 IDLE

### 2.3 跨页跳转的 content script 重注入

- 监听 `chrome.webNavigation.onCommitted`，frameId 为 0 且 tabId === agentTabId 时重注入 content script。
- 期间收到的 DOM 指令排队，content script 上线后处理；排队超时 5s 则返回 `timeout`。

---

## 3. 消息协议

### 3.1 通用结构

JSON 文本帧。每条消息含 `id`（请求-响应关联）和 `type`。

```jsonc
// agent → 扩展（请求）
{ "id": "req-001", "type": "click", "params": { "selector": "button.submit" } }

// 扩展 → agent（成功）
{ "id": "req-001", "type": "result", "ok": true, "data": { ... } }

// 扩展 → agent（失败）
{ "id": "req-001", "type": "result", "ok": false,
  "error": { "code": "element_not_found", "message": "selector matched 0 elements" } }

// 扩展 → agent（主动事件，无 id）
{ "type": "event", "name": "session_closed", "data": { "reason": "tab_closed" } }
```

### 3.2 会话指令

| type | params | 返回 data |
|---|---|---|
| `open_session` | `{ url?: string }` | `{ tabId, sessionId }` |
| `close_session` | — | `{}` |
| `ping` | — | `{ pong: true }` |

### 3.3 导航指令

| type | params | 返回 data |
|---|---|---|
| `navigate` | `{ url, waitUntil?: 'load' \| 'domcontentloaded' }`（默认 `load`） | `{ url, title }` |
| `go_back` | — | `{ url, title }` |
| `go_forward` | — | `{ url, title }` |
| `reload` | — | `{ url, title }` |

### 3.4 DOM 交互

定位参数二选一：`selector: string`（CSS）或 `index: number`（来自 `read_page{mode:'labeled'}`）。两者都提供时以 `selector` 优先；都不提供返回 `bad_params`。

| type | params | 返回 data |
|---|---|---|
| `click` | `{ selector? \| index? }` | `{}` |
| `type` | `{ selector? \| index?, text, clear?: boolean }`（默认 `clear=true`） | `{}` |
| `scroll` | `{ selector? \| index? \| y: number }`（三选一） | `{}` |

### 3.5 读取与截屏

| type | params | 返回 data |
|---|---|---|
| `read_page` | `{ mode: 'text' \| 'labeled', maxLen?: number }` | 见下 |
| `screenshot` | `{ format?: 'png' \| 'jpeg', quality?: number }` | `{ dataUrl }` |

- `mode:'text'`：返回 `{ url, title, text }`，剥离 `<script>` / `<style>`，截断到 `maxLen`（默认 20000 字符）。
- `mode:'labeled'`：返回 `{ url, title, elements: [{ index, tag, role, name, text, bbox }] }`；同时在页面叠加 `position: fixed` 编号徽章（仅供用户肉眼参考，截屏会包含）。徽章在下一次 `read_page{mode:'labeled'}` 或 navigate 时清理；`index → element` 映射保存在 content script 内存中，存活到下次重新扫描或 navigation 重注入为止。

### 3.6 错误码

| code | 含义 |
|---|---|
| `no_session` | 当前无 RUNNING 会话 |
| `session_busy` | 已有会话 |
| `tab_lost` | agent tab 不存在 |
| `nav_failed` | 导航超时或失败 |
| `element_not_found` | selector/index 未命中 |
| `element_not_interactable` | 隐藏 / 被遮挡 / disabled |
| `script_error` | content script 抛错 |
| `bad_params` | 参数缺失或类型错 |
| `timeout` | 操作超时（默认 30s） |
| `unsupported_url` | chrome:// / Web Store 等无法注入 |

### 3.7 主动事件

| name | data |
|---|---|
| `session_opened` | `{ tabId, sessionId }` |
| `session_closed` | `{ reason: 'tab_closed' \| 'user_disconnect' \| 'agent_request' }` |
| `tab_navigated` | `{ url, title }`（在 `chrome.webNavigation.onCommitted` 触发，frameId=0） |

---

## 4. 组件与文件划分

```
pc_agent_bridge/
├── manifest.json
├── background.js          # SW 装配：WS + session + 指令路由
├── ws_client.js           # WS 连接、心跳、重连
├── session.js             # 会话状态机 + tab 监听
├── commands/
│   ├── navigation.js      # navigate / go_back / go_forward / reload
│   ├── dom.js             # click / type / scroll / read_page（转发到 content）
│   └── capture.js         # screenshot
├── content.js             # 注入 agent tab：执行 DOM 指令
├── labeler.js             # 元素扫描 + 编号叠加层
├── popup.html
├── popup.js               # 状态展示、日志、host/port 配置、断开
├── style.css
└── icon.png
```

### 单元职责

- **`ws_client.js`**：维护一条 WS 连接；暴露 `send(msg)` / `onMessage(handler)`；内部处理重连与心跳；不感知业务。
- **`session.js`**：维护 `{state, agentTabId, sessionId}`；监听 `chrome.tabs.onRemoved` / `chrome.webNavigation.onCommitted`；暴露 `openSession / closeSession / getTab / onChange`。
- **`commands/*.js`**：每个文件导出 `{ [type]: async (params, ctx) => data }` 处理器；`ctx` 含 `session`、tabs API、`sendToContent`。
- **`background.js`**：装配上述模块；把 WS 收到的请求按 `type` 路由到 commands；统一异常包装。
- **`content.js` + `labeler.js`**：挂 `chrome.runtime.onMessage`；执行 DOM 操作；labeler 扫描可交互元素（`a, button, input, select, textarea, [role=button], [contenteditable], [onclick]`）并叠加编号徽章。
- **`popup.js`**：通过 `chrome.runtime.sendMessage` 拉状态；订阅变更；写配置。

### Manifest 权限

```json
{
  "manifest_version": 3,
  "name": "PC Agent Bridge",
  "version": "0.1.0",
  "permissions": ["tabs", "scripting", "storage", "alarms", "webNavigation"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background.js", "type": "module" },
  "action": { "default_popup": "popup.html" }
}
```

---

## 5. 错误处理与边界情况

- **特殊 URL（chrome://、Web Store）**：注入失败返回 `unsupported_url`，建议 agent navigate 走。
- **agent tab 内跳转**：自动重注入 content script；期间指令排队 5s 内执行，否则 `timeout`。
- **指令默认超时**：30s，可通过 params `timeoutMs` 覆盖。
- **labeler 编号失效**：每次 `read_page{mode:'labeled'}` 重置；DOM 大变后旧 index → `element_not_found`。
- **截屏**：MVP 只截可见区域（`chrome.tabs.captureVisibleTab`），不做整页拼接。
- **并发**：协议支持多请求并行（id 区分）；content script 内 DOM 写操作串行化。
- **隐私**：扩展只允许连 `127.0.0.1` / `localhost`；README 明确"只在信任本地 agent 时启用"。

---

## 6. 测试策略

### 手动测试清单

1. 启动扩展，未启动 agent → popup 显示"未连接"，并不断重试。
2. 启动 mock agent → popup 显示"已连接"。
3. 发 `open_session` → 新 tab 打开 `about:blank`，popup 显示 tabId。
4. 发 `navigate` 到一个公开网页 → 加载完成后回响应。
5. 发 `read_page{mode:'labeled'}` → 页面出现编号徽章，返回元素列表。
6. 用 `index` 发 `click` → 对应元素被点击。
7. 用 `selector` 发 `type` → 文本被输入。
8. 发 `screenshot` → 返回 dataUrl，长度合理。
9. 手动关闭 agent tab → agent 收到 `session_closed{reason:'tab_closed'}`。
10. 访问 `chrome://settings` 后发指令 → 返回 `unsupported_url`。
11. 杀掉 agent → popup 显示"未连接"，10s 内重连成功（重启 agent 后）。

### 本地 mock agent

附带 `tools/mock_agent.py`：Python `websockets` 实现的最简 WS 服务器，从 stdin 读 JSON 行发给扩展，把响应打印出来。用于端到端联调。

---

## 7. 范围外（YAGNI）

- 多 tab / 多会话
- iframe 跨域操作
- 整页滚动截屏
- 文件上传 / 下载控制
- 网络请求拦截（需 CDP）
- 用户确认机制（当前定为全自动）
- 远程 host 连接（出于安全）

---

## 8. 关键决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| 通信方式 | WebSocket | 双向实时、配置简单、不需要 Native Messaging 系统级 manifest |
| 控制接口 | content script + chrome.scripting | 与项目其他扩展一致；不触发"被自动化控制"横幅 |
| 元素定位 | CSS selector + 编号双轨 | selector 适合 agent 已读 HTML 后精准操作，编号适合"看图标号"循环 |
| Tab 模型 | 单一专用 agent tab | 避免误操作用户其他 tab，状态简单 |
| 用户确认 | 全自动，仅提供"断开"按钮 | 用户明确要求；信任本地 agent |
