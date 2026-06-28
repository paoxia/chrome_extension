# PC Agent Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension (`pc_agent_bridge`) that exposes a WebSocket protocol to a local PC agent, allowing the agent to drive a dedicated browser tab (navigate / click / type / read / screenshot).

**Architecture:** Service Worker maintains a WS client to `ws://127.0.0.1:8765`; on `open_session` it creates a dedicated tab and injects a content script that performs DOM operations. Single active session. See `docs/superpowers/specs/2026-06-28-pc-agent-bridge-design.md`.

**Tech Stack:** Chrome Manifest V3 (ES modules in SW), vanilla JS, Python 3 (`websockets` lib) for the mock agent.

**Testing approach:** Because this is a Chrome extension, the primary test vehicle is `tools/mock_agent.py` — an interactive Python WS server that loads scripted scenarios and asserts on responses. Each command task adds a scenario script under `tools/scenarios/` that exercises it end-to-end against a loaded extension.

---

## File Structure

To be created:

```
pc_agent_bridge/
├── manifest.json              # MV3 manifest, perms, SW entry
├── background.js              # SW: import modules, wire WS → command router
├── ws_client.js               # WS connect / reconnect / heartbeat
├── session.js                 # session state machine + tab listeners
├── router.js                  # dispatch incoming WS msg to command handler
├── commands/
│   ├── session_cmds.js        # open_session / close_session / ping
│   ├── navigation.js          # navigate / go_back / go_forward / reload
│   ├── dom.js                 # click / type / scroll / read_page (forwarders)
│   └── capture.js             # screenshot
├── content.js                 # injected into agent tab
├── labeler.js                 # element scan + numbered overlay
├── popup.html                 # UI
├── popup.js                   # UI logic
├── style.css                  # apple-style consistent with other extensions
└── icon.png                   # copy from bilibili_helper/

tools/
├── mock_agent.py              # WS server, scenario runner
└── scenarios/
    ├── 01_ping.py
    ├── 02_open_close.py
    ├── 03_navigate.py
    ├── 04_dom_click_type.py
    ├── 05_read_page.py
    ├── 06_labeled_index.py
    └── 07_screenshot.py
```

To be modified:

- `README.md` (root) — add a §5 section for PC Agent Bridge

---

## Conventions

- All JS uses ES module syntax (`import` / `export`).
- All async ops use `async/await`.
- Logging: every module exports `const log = (...a) => console.log('[module]', ...a)`.
- Commit message convention follows repo style (Chinese, conventional commits): `feat:` / `chore:` / `docs:` / `fix:`.
- Commands return the `data` object directly (or throw an object `{code, message}` which the router converts to error response).

---

## Task 1: Project skeleton + manifest

**Files:**
- Create: `pc_agent_bridge/manifest.json`
- Create: `pc_agent_bridge/background.js`
- Create: `pc_agent_bridge/icon.png` (copied from `bilibili_helper/icon.png`)

- [ ] **Step 1: Create directory and copy icon**

```bash
mkdir -p pc_agent_bridge/commands
cp bilibili_helper/icon.png pc_agent_bridge/icon.png
```

- [ ] **Step 2: Write manifest.json**

Create `pc_agent_bridge/manifest.json`:

```json
{
  "manifest_version": 3,
  "name": "PC Agent Bridge",
  "version": "0.1.0",
  "description": "Bridge between a local PC agent and Chrome via WebSocket",
  "icons": { "128": "icon.png" },
  "permissions": ["tabs", "scripting", "storage", "alarms", "webNavigation"],
  "host_permissions": ["<all_urls>"],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": "icon.png"
  }
}
```

- [ ] **Step 3: Write minimal background.js stub**

Create `pc_agent_bridge/background.js`:

```javascript
// background.js — entry point, wires modules together
const log = (...a) => console.log('[bg]', ...a);

chrome.runtime.onInstalled.addListener(() => log('installed'));
chrome.runtime.onStartup.addListener(() => log('startup'));
log('loaded');
```

- [ ] **Step 4: Verify load**

In Chrome: `chrome://extensions/` → enable Developer mode → Load unpacked → select `pc_agent_bridge/`. Open the SW console (link "service worker"). Expected: `[bg] loaded` printed.

- [ ] **Step 5: Add placeholder popup.html so action button doesn't error**

Create `pc_agent_bridge/popup.html`:

```html
<!doctype html>
<html><head><meta charset="utf-8"><title>PC Agent Bridge</title></head>
<body><p>Loading…</p></body></html>
```

- [ ] **Step 6: Commit**

```bash
git add pc_agent_bridge/
git commit -m "feat(pc_agent_bridge): scaffold extension with MV3 manifest"
```

---

## Task 2: Mock agent server (Python)

**Files:**
- Create: `tools/mock_agent.py`
- Create: `tools/scenarios/__init__.py` (empty)

- [ ] **Step 1: Verify Python and install websockets**

```bash
python --version
pip install websockets
```

Expected: Python ≥ 3.8; `websockets` installs OK.

- [ ] **Step 2: Write mock_agent.py**

Create `tools/mock_agent.py`:

```python
"""Mock PC agent: WS server that runs scenario scripts against the extension.

Usage:
  python tools/mock_agent.py                       # interactive REPL
  python tools/mock_agent.py scenarios/01_ping.py  # run a scenario then exit
"""
import asyncio
import json
import sys
import uuid
import importlib.util
from pathlib import Path

import websockets

HOST = "127.0.0.1"
PORT = 8765


class Bridge:
    def __init__(self, ws):
        self.ws = ws
        self.pending = {}  # id -> Future
        self.events = asyncio.Queue()

    async def send(self, type_, params=None, timeout=30):
        req_id = f"req-{uuid.uuid4().hex[:8]}"
        msg = {"id": req_id, "type": type_}
        if params is not None:
            msg["params"] = params
        fut = asyncio.get_event_loop().create_future()
        self.pending[req_id] = fut
        await self.ws.send(json.dumps(msg))
        print(f"-> {msg}")
        return await asyncio.wait_for(fut, timeout=timeout)

    async def wait_event(self, name, timeout=30):
        end = asyncio.get_event_loop().time() + timeout
        while True:
            remaining = end - asyncio.get_event_loop().time()
            if remaining <= 0:
                raise TimeoutError(f"event {name} not received")
            ev = await asyncio.wait_for(self.events.get(), timeout=remaining)
            if ev.get("name") == name:
                return ev

    async def _reader(self):
        async for raw in self.ws:
            msg = json.loads(raw)
            print(f"<- {msg}")
            if msg.get("type") == "result":
                fut = self.pending.pop(msg["id"], None)
                if fut and not fut.done():
                    if msg.get("ok"):
                        fut.set_result(msg.get("data", {}))
                    else:
                        fut.set_exception(RuntimeError(json.dumps(msg.get("error"))))
            elif msg.get("type") == "event":
                await self.events.put(msg)


async def run_scenario(bridge: Bridge, path: str):
    spec = importlib.util.spec_from_file_location("scenario", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    await mod.run(bridge)


async def main():
    scenario_path = sys.argv[1] if len(sys.argv) > 1 else None
    print(f"mock_agent listening on ws://{HOST}:{PORT}")
    print("Load the extension; it will auto-connect.")

    connected = asyncio.Event()
    result_holder = {"err": None}

    async def handler(ws):
        if connected.is_set():
            await ws.close()
            return
        connected.set()
        bridge = Bridge(ws)
        reader_task = asyncio.create_task(bridge._reader())
        try:
            if scenario_path:
                await run_scenario(bridge, scenario_path)
                print("scenario OK")
            else:
                # interactive REPL
                while True:
                    line = await asyncio.get_event_loop().run_in_executor(
                        None, sys.stdin.readline)
                    if not line:
                        break
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        msg = json.loads(line)
                        data = await bridge.send(msg["type"], msg.get("params"))
                        print(f"OK: {data}")
                    except Exception as e:
                        print(f"ERR: {e}")
        except Exception as e:
            result_holder["err"] = e
            print(f"scenario FAILED: {e}")
        finally:
            reader_task.cancel()
            if scenario_path:
                asyncio.get_event_loop().call_later(0.1, lambda: sys.exit(
                    1 if result_holder["err"] else 0))

    async with websockets.serve(handler, HOST, PORT):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 3: Create empty scenarios package**

```bash
mkdir -p tools/scenarios
touch tools/scenarios/__init__.py
```

- [ ] **Step 4: Smoke test mock_agent (no scenario)**

```bash
python tools/mock_agent.py
```

Expected: prints `mock_agent listening on ws://127.0.0.1:8765`. Kill with Ctrl-C. We're not connecting yet — just verifying the server starts.

- [ ] **Step 5: Commit**

```bash
git add tools/
git commit -m "feat(tools): add mock_agent WS server for extension testing"
```

---

## Task 3: WS client module with reconnect + heartbeat

**Files:**
- Create: `pc_agent_bridge/ws_client.js`
- Modify: `pc_agent_bridge/background.js`

- [ ] **Step 1: Write ws_client.js**

Create `pc_agent_bridge/ws_client.js`:

```javascript
// ws_client.js — single WS connection with reconnect + heartbeat
const log = (...a) => console.log('[ws]', ...a);

const BACKOFF_MS = [1000, 2000, 5000, 10000];
const HEARTBEAT_MS = 20000;
const HEARTBEAT_TIMEOUT_MS = 60000;

export function createWsClient({ getUrl, onMessage, onStatusChange }) {
  let ws = null;
  let backoffIdx = 0;
  let heartbeatTimer = null;
  let lastPongAt = 0;
  let stopped = false;
  let status = 'disconnected';

  const setStatus = (s) => {
    if (s !== status) {
      status = s;
      onStatusChange?.(s);
    }
  };

  function connect() {
    if (stopped) return;
    const url = getUrl();
    setStatus('connecting');
    try {
      ws = new WebSocket(url);
    } catch (e) {
      log('ctor failed', e);
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      log('open', url);
      backoffIdx = 0;
      lastPongAt = Date.now();
      setStatus('connected');
      startHeartbeat();
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { log('bad json', ev.data); return; }
      // internal pong handling
      if (msg.type === 'result' && msg.id && msg.id.startsWith('hb-')) {
        lastPongAt = Date.now();
        return;
      }
      onMessage?.(msg);
    };
    ws.onclose = () => {
      log('close');
      stopHeartbeat();
      setStatus('disconnected');
      scheduleReconnect();
    };
    ws.onerror = (e) => log('error', e.message || e);
  }

  function scheduleReconnect() {
    if (stopped) return;
    const delay = BACKOFF_MS[Math.min(backoffIdx, BACKOFF_MS.length - 1)];
    backoffIdx++;
    log(`reconnect in ${delay}ms`);
    setTimeout(connect, delay);
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastPongAt > HEARTBEAT_TIMEOUT_MS) {
        log('heartbeat timeout, forcing close');
        try { ws.close(); } catch {}
        return;
      }
      // server is the one sending pings in our model;
      // but we also send a self-ping to detect dead sockets.
      try {
        ws.send(JSON.stringify({ id: `hb-${Date.now()}`, type: 'ping' }));
      } catch {}
    }, HEARTBEAT_MS);
  }

  function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  }

  function send(msg) {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      log('send while not open, dropping', msg);
      return false;
    }
    ws.send(JSON.stringify(msg));
    return true;
  }

  function stop() {
    stopped = true;
    stopHeartbeat();
    if (ws) try { ws.close(); } catch {}
  }

  return { connect, send, stop, getStatus: () => status };
}
```

Note: in our protocol, `ping` is a request type that the server (mock_agent) handles like any other. We treat `hb-*` requests internally so they don't flow up to business logic. The server should respond `{ok:true, data:{pong:true}}` to `ping`.

- [ ] **Step 2: Wire WS client in background.js**

Replace `pc_agent_bridge/background.js`:

```javascript
// background.js — entry point
import { createWsClient } from './ws_client.js';

const log = (...a) => console.log('[bg]', ...a);

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8765;

async function getUrl() {
  const { wsHost, wsPort } = await chrome.storage.local.get(['wsHost', 'wsPort']);
  return `ws://${wsHost || DEFAULT_HOST}:${wsPort || DEFAULT_PORT}`;
}

const client = createWsClient({
  getUrl: () => {
    // sync wrapper — read cached value
    return cachedUrl;
  },
  onMessage: (msg) => log('msg', msg),
  onStatusChange: (s) => {
    log('status', s);
    chrome.storage.local.set({ wsStatus: s });
  },
});

let cachedUrl = `ws://${DEFAULT_HOST}:${DEFAULT_PORT}`;
async function refreshUrl() {
  cachedUrl = await getUrl();
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.wsHost || changes.wsPort) {
    refreshUrl().then(() => {
      client.stop();
      // recreate is overkill for MVP — just rely on reconnect chain.
      // Simpler: full reload of extension when user changes host/port.
    });
  }
});

// MV3 SW keep-alive
chrome.alarms.create('keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => { /* noop — wakeup */ });

(async () => {
  await refreshUrl();
  client.connect();
})();

log('loaded');
```

- [ ] **Step 3: Verify auto-connect**

Reload extension in `chrome://extensions/`. Start mock_agent:

```bash
python tools/mock_agent.py
```

Open SW console. Expected: `[ws] open ws://127.0.0.1:8765`, then `[bg] status connected`. mock_agent prints incoming `{id:'hb-...', type:'ping'}` every 20s.

- [ ] **Step 4: Verify reconnect**

Stop mock_agent (Ctrl-C). SW console expected: `[ws] close`, `[ws] reconnect in 1000ms`. Restart mock_agent. Expected: reconnects within ~10s.

- [ ] **Step 5: Commit**

```bash
git add pc_agent_bridge/ws_client.js pc_agent_bridge/background.js
git commit -m "feat(pc_agent_bridge): WS client with reconnect and heartbeat"
```

---

## Task 4: Router + ping handler + first scenario

**Files:**
- Create: `pc_agent_bridge/router.js`
- Create: `pc_agent_bridge/commands/session_cmds.js`
- Create: `tools/scenarios/01_ping.py`
- Modify: `pc_agent_bridge/background.js`

- [ ] **Step 1: Write router.js**

Create `pc_agent_bridge/router.js`:

```javascript
// router.js — dispatch incoming request msgs to handler(params, ctx) → data
const log = (...a) => console.log('[router]', ...a);

export function createRouter() {
  const handlers = new Map();
  function register(type, fn) { handlers.set(type, fn); }

  async function handle(msg, ctx) {
    if (msg.type !== 'result' && msg.type !== 'event' && msg.id) {
      const fn = handlers.get(msg.type);
      if (!fn) {
        return { id: msg.id, type: 'result', ok: false,
                 error: { code: 'bad_params', message: `unknown type: ${msg.type}` } };
      }
      try {
        const data = await fn(msg.params || {}, ctx);
        return { id: msg.id, type: 'result', ok: true, data: data || {} };
      } catch (e) {
        const err = (e && e.code) ? e : { code: 'script_error', message: String(e?.message || e) };
        log('handler error', msg.type, err);
        return { id: msg.id, type: 'result', ok: false, error: err };
      }
    }
    return null;
  }
  return { register, handle };
}
```

- [ ] **Step 2: Write session_cmds.js with ping**

Create `pc_agent_bridge/commands/session_cmds.js`:

```javascript
// commands/session_cmds.js
export const sessionCommands = {
  ping: async () => ({ pong: true }),
  // open_session / close_session added in Task 5
};
```

- [ ] **Step 3: Wire router in background.js**

Modify `pc_agent_bridge/background.js` — replace the `onMessage` line and add wiring at top of file:

```javascript
import { createWsClient } from './ws_client.js';
import { createRouter } from './router.js';
import { sessionCommands } from './commands/session_cmds.js';

const log = (...a) => console.log('[bg]', ...a);

const router = createRouter();
Object.entries(sessionCommands).forEach(([t, fn]) => router.register(t, fn));

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8765;
let cachedUrl = `ws://${DEFAULT_HOST}:${DEFAULT_PORT}`;

async function refreshUrl() {
  const { wsHost, wsPort } = await chrome.storage.local.get(['wsHost', 'wsPort']);
  cachedUrl = `ws://${wsHost || DEFAULT_HOST}:${wsPort || DEFAULT_PORT}`;
}

const ctx = {}; // commands will read fields from this

const client = createWsClient({
  getUrl: () => cachedUrl,
  onMessage: async (msg) => {
    const response = await router.handle(msg, ctx);
    if (response) client.send(response);
  },
  onStatusChange: (s) => {
    log('status', s);
    chrome.storage.local.set({ wsStatus: s });
  },
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.wsHost || changes.wsPort) refreshUrl();
});

chrome.alarms.create('keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => {});

(async () => { await refreshUrl(); client.connect(); })();
log('loaded');
```

- [ ] **Step 4: Write scenario 01_ping.py**

Create `tools/scenarios/01_ping.py`:

```python
"""Verify ping returns pong."""

async def run(bridge):
    data = await bridge.send('ping')
    assert data == {'pong': True}, f"unexpected: {data}"
```

- [ ] **Step 5: Run scenario**

Reload extension. Run:

```bash
python tools/mock_agent.py tools/scenarios/01_ping.py
```

Expected: prints `-> {...ping}` then `<- {...pong: true}` then `scenario OK` and exits with code 0.

- [ ] **Step 6: Commit**

```bash
git add pc_agent_bridge/ tools/scenarios/01_ping.py
git commit -m "feat(pc_agent_bridge): command router and ping handler"
```

---

## Task 5: Session state machine + open/close session

**Files:**
- Create: `pc_agent_bridge/session.js`
- Modify: `pc_agent_bridge/commands/session_cmds.js`
- Modify: `pc_agent_bridge/background.js`
- Create: `tools/scenarios/02_open_close.py`

- [ ] **Step 1: Write session.js**

Create `pc_agent_bridge/session.js`:

```javascript
// session.js — single-session state machine
const log = (...a) => console.log('[session]', ...a);

export function createSession({ onEvent }) {
  let state = 'IDLE';     // IDLE | RUNNING
  let agentTabId = null;
  let sessionId = null;

  function snapshot() {
    return { state, agentTabId, sessionId };
  }

  async function openSession({ url } = {}) {
    if (state === 'RUNNING') {
      throw { code: 'session_busy', message: 'a session is already active' };
    }
    const tab = await chrome.tabs.create({ url: url || 'about:blank', active: true });
    await waitForComplete(tab.id);
    agentTabId = tab.id;
    sessionId = `sess-${Date.now()}`;
    state = 'RUNNING';
    log('opened', { agentTabId, sessionId });
    onEvent?.({ type: 'event', name: 'session_opened',
                data: { tabId: agentTabId, sessionId } });
    return { tabId: agentTabId, sessionId };
  }

  async function closeSession(reason = 'agent_request') {
    if (state !== 'RUNNING') return {};
    const tabId = agentTabId;
    state = 'IDLE'; agentTabId = null; sessionId = null;
    try { if (tabId) await chrome.tabs.remove(tabId); } catch {}
    log('closed', reason);
    onEvent?.({ type: 'event', name: 'session_closed', data: { reason } });
    return {};
  }

  function waitForComplete(tabId) {
    return new Promise((resolve) => {
      function check(id, info) {
        if (id === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(check);
          resolve();
        }
      }
      chrome.tabs.onUpdated.addListener(check);
    });
  }

  chrome.tabs.onRemoved.addListener((tabId) => {
    if (state === 'RUNNING' && tabId === agentTabId) {
      state = 'IDLE'; agentTabId = null; sessionId = null;
      log('tab closed by user');
      onEvent?.({ type: 'event', name: 'session_closed', data: { reason: 'tab_closed' } });
    }
  });

  function requireRunning() {
    if (state !== 'RUNNING') {
      throw { code: 'no_session', message: 'no active session' };
    }
    return agentTabId;
  }

  return { openSession, closeSession, snapshot, requireRunning };
}
```

- [ ] **Step 2: Add open_session / close_session handlers**

Replace `pc_agent_bridge/commands/session_cmds.js`:

```javascript
// commands/session_cmds.js
export function makeSessionCommands(session) {
  return {
    ping: async () => ({ pong: true }),
    open_session: async ({ url } = {}) => session.openSession({ url }),
    close_session: async () => session.closeSession('agent_request'),
  };
}
```

- [ ] **Step 3: Wire session in background.js**

Modify `pc_agent_bridge/background.js`. Change imports and wiring:

```javascript
import { createWsClient } from './ws_client.js';
import { createRouter } from './router.js';
import { makeSessionCommands } from './commands/session_cmds.js';
import { createSession } from './session.js';

const log = (...a) => console.log('[bg]', ...a);

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8765;
let cachedUrl = `ws://${DEFAULT_HOST}:${DEFAULT_PORT}`;

async function refreshUrl() {
  const { wsHost, wsPort } = await chrome.storage.local.get(['wsHost', 'wsPort']);
  cachedUrl = `ws://${wsHost || DEFAULT_HOST}:${wsPort || DEFAULT_PORT}`;
}

const session = createSession({
  onEvent: (ev) => client.send(ev),
});

const router = createRouter();
Object.entries(makeSessionCommands(session)).forEach(([t, fn]) => router.register(t, fn));

const ctx = { session };

const client = createWsClient({
  getUrl: () => cachedUrl,
  onMessage: async (msg) => {
    const response = await router.handle(msg, ctx);
    if (response) client.send(response);
  },
  onStatusChange: (s) => {
    log('status', s);
    chrome.storage.local.set({ wsStatus: s });
  },
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.wsHost || changes.wsPort) refreshUrl();
});

chrome.alarms.create('keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => {});

(async () => { await refreshUrl(); client.connect(); })();
log('loaded');
```

- [ ] **Step 4: Write scenario 02_open_close.py**

Create `tools/scenarios/02_open_close.py`:

```python
"""open_session creates a tab; close_session removes it; session_busy enforced."""
import asyncio

async def run(bridge):
    r = await bridge.send('open_session', {'url': 'about:blank'})
    assert 'tabId' in r and 'sessionId' in r, r

    # second open should fail with session_busy
    try:
        await bridge.send('open_session')
        raise AssertionError('expected session_busy')
    except RuntimeError as e:
        assert 'session_busy' in str(e), str(e)

    await bridge.send('close_session')
    # event should arrive
    ev = await bridge.wait_event('session_closed', timeout=5)
    assert ev['data']['reason'] == 'agent_request', ev
```

- [ ] **Step 5: Run scenario**

Reload extension. Run:

```bash
python tools/mock_agent.py tools/scenarios/02_open_close.py
```

Expected: new tab opens with `about:blank`, then closes; scenario prints `scenario OK`.

- [ ] **Step 6: Verify user-closed-tab path manually**

Run `python tools/mock_agent.py` (no scenario). In REPL stdin type:

```
{"type":"open_session","params":{"url":"https://example.com"}}
```

After response, close the new tab manually. Expected: mock_agent prints `<- {type:'event', name:'session_closed', data:{reason:'tab_closed'}}`.

- [ ] **Step 7: Commit**

```bash
git add pc_agent_bridge/ tools/scenarios/02_open_close.py
git commit -m "feat(pc_agent_bridge): session state machine with open/close"
```

---

## Task 6: Content script + injection on session open

**Files:**
- Create: `pc_agent_bridge/content.js`
- Modify: `pc_agent_bridge/session.js`

- [ ] **Step 1: Write minimal content.js**

Create `pc_agent_bridge/content.js`:

```javascript
// content.js — runs in agent tab
const log = (...a) => console.log('[content]', ...a);

const handlers = {
  hello: async () => ({ ok: true, url: location.href, title: document.title }),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const fn = handlers[msg.type];
  if (!fn) {
    sendResponse({ ok: false, error: { code: 'bad_params', message: `no handler: ${msg.type}` } });
    return false;
  }
  Promise.resolve(fn(msg.params || {}))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => sendResponse({ ok: false,
      error: e?.code ? e : { code: 'script_error', message: String(e?.message || e) } }));
  return true; // async response
});

log('loaded on', location.href);
```

- [ ] **Step 2: Inject content script after tab loads**

In `pc_agent_bridge/session.js`, modify `openSession` to inject after `waitForComplete`:

Replace the body of `openSession` between `await waitForComplete(tab.id);` and `agentTabId = tab.id;` so it reads:

```javascript
    await waitForComplete(tab.id);
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
    } catch (e) {
      try { await chrome.tabs.remove(tab.id); } catch {}
      throw { code: 'unsupported_url', message: String(e?.message || e) };
    }
    agentTabId = tab.id;
```

- [ ] **Step 3: Add ctx.sendToContent helper in background.js**

Add to `pc_agent_bridge/background.js` after `const ctx = { session };` line:

```javascript
ctx.sendToContent = async (type, params) => {
  const tabId = session.requireRunning();
  const reply = await chrome.tabs.sendMessage(tabId, { type, params });
  if (!reply) throw { code: 'script_error', message: 'no reply from content' };
  if (!reply.ok) throw reply.error || { code: 'script_error', message: 'unknown error' };
  return reply.data;
};
```

- [ ] **Step 4: Add a temporary `hello` handler to verify the pipe**

In `pc_agent_bridge/commands/session_cmds.js`, add (inside `makeSessionCommands` return object):

```javascript
    hello: async (_, ctx) => ctx.sendToContent('hello'),
```

The `ctx` argument is passed by the router as the second arg. The router currently doesn't pass it — fix router. In `pc_agent_bridge/router.js`, change `const data = await fn(msg.params || {}, ctx);` — that line is already correct. Verify by reading the file.

- [ ] **Step 5: Manual verify**

Reload extension. Start mock_agent in REPL mode (`python tools/mock_agent.py`). Type:

```
{"type":"open_session","params":{"url":"https://example.com"}}
{"type":"hello"}
```

Expected second response: `{ok:true, data:{ok:true, url:'https://example.com/', title:'Example Domain'}}`.

- [ ] **Step 6: Remove `hello` handler**

Delete the `hello:` line added in Step 4 — it was scaffolding.

- [ ] **Step 7: Commit**

```bash
git add pc_agent_bridge/
git commit -m "feat(pc_agent_bridge): inject content script on session open"
```

---

## Task 7: Navigation commands

**Files:**
- Create: `pc_agent_bridge/commands/navigation.js`
- Modify: `pc_agent_bridge/background.js`
- Create: `tools/scenarios/03_navigate.py`

- [ ] **Step 1: Write navigation.js**

Create `pc_agent_bridge/commands/navigation.js`:

```javascript
// commands/navigation.js
const NAV_TIMEOUT_MS = 30000;

function waitForComplete(tabId, timeoutMs = NAV_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(check);
      reject({ code: 'nav_failed', message: 'navigation timeout' });
    }, timeoutMs);
    function check(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(check);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(check);
  });
}

async function tabInfo(tabId) {
  const t = await chrome.tabs.get(tabId);
  return { url: t.url, title: t.title };
}

export function makeNavigationCommands(session) {
  async function nav(action, { url } = {}) {
    const tabId = session.requireRunning();
    if (action === 'navigate') {
      if (!url) throw { code: 'bad_params', message: 'url required' };
      await chrome.tabs.update(tabId, { url });
    } else if (action === 'go_back') {
      await chrome.tabs.goBack(tabId);
    } else if (action === 'go_forward') {
      await chrome.tabs.goForward(tabId);
    } else if (action === 'reload') {
      await chrome.tabs.reload(tabId);
    }
    await waitForComplete(tabId);
    return tabInfo(tabId);
  }
  return {
    navigate:   (p) => nav('navigate', p),
    go_back:    ()  => nav('go_back'),
    go_forward: ()  => nav('go_forward'),
    reload:     ()  => nav('reload'),
  };
}
```

- [ ] **Step 2: Register navigation commands in background.js**

Modify `pc_agent_bridge/background.js`. Add import and register:

```javascript
import { makeNavigationCommands } from './commands/navigation.js';
// ...
Object.entries(makeNavigationCommands(session)).forEach(([t, fn]) => router.register(t, fn));
```

Add the line after the existing `Object.entries(makeSessionCommands(...))` line.

- [ ] **Step 3: Write scenario 03_navigate.py**

Create `tools/scenarios/03_navigate.py`:

```python
"""navigate / go_back / reload work."""
async def run(bridge):
    await bridge.send('open_session')
    r = await bridge.send('navigate', {'url': 'https://example.com'})
    assert 'example.com' in r['url'], r
    r = await bridge.send('navigate', {'url': 'https://example.org'})
    assert 'example.org' in r['url'], r
    r = await bridge.send('go_back')
    assert 'example.com' in r['url'], r
    r = await bridge.send('reload')
    assert 'example.com' in r['url'], r
    await bridge.send('close_session')
```

- [ ] **Step 4: Run scenario**

```bash
python tools/mock_agent.py tools/scenarios/03_navigate.py
```

Expected: tab navigates through 2 URLs and back; `scenario OK`.

- [ ] **Step 5: Test bad params**

In REPL: `{"type":"navigate","params":{}}` → expect `bad_params`.

- [ ] **Step 6: Commit**

```bash
git add pc_agent_bridge/commands/navigation.js pc_agent_bridge/background.js tools/scenarios/03_navigate.py
git commit -m "feat(pc_agent_bridge): navigate / go_back / go_forward / reload"
```

---

## Task 8: DOM commands — click / type / scroll

**Files:**
- Modify: `pc_agent_bridge/content.js`
- Create: `pc_agent_bridge/commands/dom.js`
- Modify: `pc_agent_bridge/background.js`
- Create: `tools/scenarios/04_dom_click_type.py`

- [ ] **Step 1: Extend content.js handlers**

Modify `pc_agent_bridge/content.js`. Replace the `handlers` object with:

```javascript
let labeledMap = new Map(); // index -> element (filled in Task 10)

function resolveElement({ selector, index }) {
  if (selector && typeof selector === 'string') {
    const el = document.querySelector(selector);
    if (!el) throw { code: 'element_not_found', message: `no match: ${selector}` };
    return el;
  }
  if (typeof index === 'number') {
    const el = labeledMap.get(index);
    if (!el || !el.isConnected) throw { code: 'element_not_found', message: `bad index: ${index}` };
    return el;
  }
  throw { code: 'bad_params', message: 'selector or index required' };
}

function ensureInteractable(el) {
  const rect = el.getBoundingClientRect();
  const visible = rect.width > 0 && rect.height > 0;
  const style = getComputedStyle(el);
  const displayed = style.visibility !== 'hidden' && style.display !== 'none';
  if (!visible || !displayed) {
    throw { code: 'element_not_interactable', message: 'element not visible' };
  }
  if (el.disabled) {
    throw { code: 'element_not_interactable', message: 'element disabled' };
  }
}

const handlers = {
  click: async (p) => {
    const el = resolveElement(p);
    ensureInteractable(el);
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.click();
    return {};
  },

  type: async ({ selector, index, text, clear = true }) => {
    if (typeof text !== 'string') throw { code: 'bad_params', message: 'text required' };
    const el = resolveElement({ selector, index });
    ensureInteractable(el);
    el.focus();
    const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    if (clear) {
      if (isInput) {
        el.value = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
      } else if (el.isContentEditable) {
        el.textContent = '';
      }
    }
    if (isInput) {
      const setter = Object.getOwnPropertyDescriptor(
        isInput && el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value').set;
      setter.call(el, (clear ? '' : el.value) + text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.isContentEditable) {
      el.textContent = (clear ? '' : el.textContent) + text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
    } else {
      throw { code: 'element_not_interactable', message: 'not an input or contenteditable' };
    }
    return {};
  },

  scroll: async ({ selector, index, y }) => {
    if (typeof y === 'number') {
      window.scrollBy({ top: y, behavior: 'instant' });
      return {};
    }
    const el = resolveElement({ selector, index });
    el.scrollIntoView({ block: 'center', inline: 'center' });
    return {};
  },
};
```

Keep the existing `chrome.runtime.onMessage.addListener` block — it works with the new handlers map.

- [ ] **Step 2: Write commands/dom.js (SW-side forwarders)**

Create `pc_agent_bridge/commands/dom.js`:

```javascript
// commands/dom.js — forward DOM commands to content script
export function makeDomCommands(ctx) {
  return {
    click:  (p) => ctx.sendToContent('click', p),
    type:   (p) => ctx.sendToContent('type', p),
    scroll: (p) => ctx.sendToContent('scroll', p),
    // read_page added in Task 9 / 10
  };
}
```

- [ ] **Step 3: Register dom commands in background.js**

Modify `pc_agent_bridge/background.js`. Add import and registration after navigation registration:

```javascript
import { makeDomCommands } from './commands/dom.js';
// ...
Object.entries(makeDomCommands(ctx)).forEach(([t, fn]) => router.register(t, fn));
```

Important: this registration must happen AFTER `ctx.sendToContent` is defined. Verify line order in the file: `ctx.sendToContent = ...` must precede this registration.

- [ ] **Step 4: Write scenario 04_dom_click_type.py**

Create `tools/scenarios/04_dom_click_type.py`:

```python
"""click + type against duckduckgo search."""
import asyncio

async def run(bridge):
    await bridge.send('open_session', {'url': 'https://duckduckgo.com/'})
    await asyncio.sleep(1)  # let JS settle
    await bridge.send('type', {'selector': 'input[name="q"]', 'text': 'hello world'})
    await bridge.send('click', {'selector': 'button[type="submit"]'})
    await asyncio.sleep(2)  # results page
    await bridge.send('close_session')
```

- [ ] **Step 5: Run scenario**

```bash
python tools/mock_agent.py tools/scenarios/04_dom_click_type.py
```

Expected: tab opens DuckDuckGo, types "hello world", submits, results page loads, closes.

- [ ] **Step 6: Test error paths**

In REPL after `open_session`:

```
{"type":"click","params":{"selector":"button.nope-xyz"}}
```

Expected: `{ok:false, error:{code:'element_not_found', ...}}`.

- [ ] **Step 7: Commit**

```bash
git add pc_agent_bridge/ tools/scenarios/04_dom_click_type.py
git commit -m "feat(pc_agent_bridge): click / type / scroll DOM commands"
```

---

## Task 9: read_page (text mode)

**Files:**
- Modify: `pc_agent_bridge/content.js`
- Modify: `pc_agent_bridge/commands/dom.js`
- Create: `tools/scenarios/05_read_page.py`

- [ ] **Step 1: Add read_page text handler in content.js**

In `pc_agent_bridge/content.js`, inside the `handlers` object, add:

```javascript
  read_page: async ({ mode = 'text', maxLen = 20000 } = {}) => {
    if (mode === 'text') {
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('script, style, noscript').forEach(n => n.remove());
      let text = clone.innerText || clone.textContent || '';
      text = text.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (text.length > maxLen) text = text.slice(0, maxLen);
      return { url: location.href, title: document.title, text };
    }
    // mode === 'labeled' implemented in Task 10
    throw { code: 'bad_params', message: `unsupported mode: ${mode}` };
  },
```

- [ ] **Step 2: Add read_page forwarder in dom.js**

In `pc_agent_bridge/commands/dom.js`, add inside the returned object:

```javascript
    read_page: (p) => ctx.sendToContent('read_page', p),
```

- [ ] **Step 3: Write scenario 05_read_page.py**

Create `tools/scenarios/05_read_page.py`:

```python
"""read_page text mode returns visible text."""
async def run(bridge):
    await bridge.send('open_session', {'url': 'https://example.com'})
    r = await bridge.send('read_page', {'mode': 'text'})
    assert 'Example Domain' in r['title'], r
    assert 'Example Domain' in r['text'], r['text'][:200]
    # maxLen
    r2 = await bridge.send('read_page', {'mode': 'text', 'maxLen': 30})
    assert len(r2['text']) <= 30, r2
    await bridge.send('close_session')
```

- [ ] **Step 4: Run scenario**

```bash
python tools/mock_agent.py tools/scenarios/05_read_page.py
```

Expected: `scenario OK`.

- [ ] **Step 5: Commit**

```bash
git add pc_agent_bridge/ tools/scenarios/05_read_page.py
git commit -m "feat(pc_agent_bridge): read_page text mode"
```

---

## Task 10: Labeler + read_page labeled mode + index-based ops

**Files:**
- Create: `pc_agent_bridge/labeler.js`
- Modify: `pc_agent_bridge/content.js`
- Create: `tools/scenarios/06_labeled_index.py`

- [ ] **Step 1: Write labeler.js**

Create `pc_agent_bridge/labeler.js`:

```javascript
// labeler.js — scan interactive elements, draw numbered badges, return index map
const SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[onclick]',
].join(',');

const OVERLAY_ID = '__pc_agent_overlay__';

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return false;
  if (rect.bottom < 0 || rect.right < 0) return false;
  if (rect.top > innerHeight || rect.left > innerWidth) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
}

function getAccessibleName(el) {
  return (
    el.getAttribute('aria-label') ||
    el.getAttribute('alt') ||
    el.getAttribute('title') ||
    el.getAttribute('placeholder') ||
    (el.innerText || '').trim().slice(0, 60) ||
    el.getAttribute('name') ||
    ''
  );
}

export function clearOverlay() {
  const o = document.getElementById(OVERLAY_ID);
  if (o) o.remove();
}

export function scanAndLabel() {
  clearOverlay();
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  Object.assign(overlay.style, {
    position: 'fixed', top: '0', left: '0', width: '0', height: '0',
    zIndex: '2147483647', pointerEvents: 'none',
  });
  document.documentElement.appendChild(overlay);

  const elements = [];
  const map = new Map();
  const candidates = Array.from(document.querySelectorAll(SELECTOR));
  let idx = 0;
  for (const el of candidates) {
    if (!isVisible(el)) continue;
    const rect = el.getBoundingClientRect();
    const item = {
      index: idx,
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role') || '',
      name: getAccessibleName(el),
      text: (el.innerText || '').trim().slice(0, 80),
      bbox: { x: Math.round(rect.left), y: Math.round(rect.top),
              w: Math.round(rect.width), h: Math.round(rect.height) },
    };
    elements.push(item);
    map.set(idx, el);

    const badge = document.createElement('div');
    badge.textContent = String(idx);
    Object.assign(badge.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      background: 'rgba(255, 80, 80, 0.85)',
      color: 'white',
      font: 'bold 11px/14px monospace',
      padding: '1px 4px',
      borderRadius: '3px',
      pointerEvents: 'none',
    });
    overlay.appendChild(badge);

    idx++;
  }
  return { elements, map };
}
```

- [ ] **Step 2: Hook labeler into content.js**

Modify `pc_agent_bridge/content.js`. At the top after the log line, add:

```javascript
import { scanAndLabel, clearOverlay } from './labeler.js';
```

Wait — content scripts injected via `chrome.scripting.executeScript({files})` don't support ES modules. We must inline the labeler or use a different injection method.

**Decision:** Keep ES modules in SW only. For content script, copy `labeler.js` contents into `content.js` (delete `labeler.js` if necessary), OR use `chrome.scripting.executeScript` with `files: ['labeler.js', 'content.js']` where `labeler.js` is a classic script attaching helpers to a shared object.

Use the multi-file approach. Rewrite `pc_agent_bridge/labeler.js` to attach to a global:

Replace `pc_agent_bridge/labeler.js` with:

```javascript
// labeler.js — loaded before content.js in agent tab; attaches to window.__pcAgent
(() => {
  const SELECTOR = [
    'a[href]','button','input:not([type="hidden"])','select','textarea',
    '[role="button"]','[role="link"]','[role="checkbox"]','[role="radio"]',
    '[role="tab"]','[role="menuitem"]',
    '[contenteditable=""]','[contenteditable="true"]','[onclick]',
  ].join(',');
  const OVERLAY_ID = '__pc_agent_overlay__';

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (r.bottom < 0 || r.right < 0) return false;
    if (r.top > innerHeight || r.left > innerWidth) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  }

  function name(el) {
    return el.getAttribute('aria-label') || el.getAttribute('alt') ||
      el.getAttribute('title') || el.getAttribute('placeholder') ||
      (el.innerText || '').trim().slice(0, 60) || el.getAttribute('name') || '';
  }

  function clearOverlay() {
    const o = document.getElementById(OVERLAY_ID);
    if (o) o.remove();
  }

  function scanAndLabel() {
    clearOverlay();
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    Object.assign(overlay.style, {
      position: 'fixed', top: '0', left: '0', width: '0', height: '0',
      zIndex: '2147483647', pointerEvents: 'none',
    });
    document.documentElement.appendChild(overlay);

    const elements = [];
    const map = new Map();
    let idx = 0;
    for (const el of document.querySelectorAll(SELECTOR)) {
      if (!isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      elements.push({
        index: idx, tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || '', name: name(el),
        text: (el.innerText || '').trim().slice(0, 80),
        bbox: { x: Math.round(rect.left), y: Math.round(rect.top),
                w: Math.round(rect.width), h: Math.round(rect.height) },
      });
      map.set(idx, el);
      const badge = document.createElement('div');
      badge.textContent = String(idx);
      Object.assign(badge.style, {
        position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
        background: 'rgba(255,80,80,0.85)', color: 'white',
        font: 'bold 11px/14px monospace', padding: '1px 4px',
        borderRadius: '3px', pointerEvents: 'none',
      });
      overlay.appendChild(badge);
      idx++;
    }
    return { elements, map };
  }

  window.__pcAgent = window.__pcAgent || {};
  window.__pcAgent.scanAndLabel = scanAndLabel;
  window.__pcAgent.clearOverlay = clearOverlay;
})();
```

- [ ] **Step 3: Update session.js to inject labeler.js before content.js**

In `pc_agent_bridge/session.js`, change the `executeScript` call to:

```javascript
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['labeler.js', 'content.js'],
      });
```

- [ ] **Step 4: Update content.js to use labeler + labeled mode**

In `pc_agent_bridge/content.js`:

1. Remove the `import` line if any was added in Step 2 (it doesn't work).
2. Change the `labeledMap` declaration to read from `window.__pcAgent`.
3. Implement `mode: 'labeled'` in `read_page`.

Replace the `labeledMap` line near the top with:

```javascript
let labeledMap = new Map();
```

Replace the `read_page` handler body with:

```javascript
  read_page: async ({ mode = 'text', maxLen = 20000 } = {}) => {
    if (mode === 'text') {
      const clone = document.body.cloneNode(true);
      clone.querySelectorAll('script, style, noscript').forEach(n => n.remove());
      let text = clone.innerText || clone.textContent || '';
      text = text.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      if (text.length > maxLen) text = text.slice(0, maxLen);
      return { url: location.href, title: document.title, text };
    }
    if (mode === 'labeled') {
      const { elements, map } = window.__pcAgent.scanAndLabel();
      labeledMap = map;
      return { url: location.href, title: document.title, elements };
    }
    throw { code: 'bad_params', message: `unsupported mode: ${mode}` };
  },
```

Also: on every navigation inside the page, the content script reloads (new instance). The labeledMap resets automatically. Add `window.__pcAgent.clearOverlay()` cleanup on navigate command (handled by reload). No extra work needed.

- [ ] **Step 5: Write scenario 06_labeled_index.py**

Create `tools/scenarios/06_labeled_index.py`:

```python
"""read_page labeled returns indices; click by index works."""
import asyncio

async def run(bridge):
    await bridge.send('open_session', {'url': 'https://example.com'})
    await asyncio.sleep(0.5)
    r = await bridge.send('read_page', {'mode': 'labeled'})
    assert isinstance(r['elements'], list) and len(r['elements']) > 0, r
    # find the "More information..." link by name
    link = next((e for e in r['elements'] if 'More information' in (e.get('name') or '')), None)
    if link is None:
        # fall back to first link
        link = next((e for e in r['elements'] if e['tag'] == 'a'), None)
    assert link, r['elements']
    await bridge.send('click', {'index': link['index']})
    await asyncio.sleep(1)
    # After navigation, labeler map resets; old index should fail
    try:
        await bridge.send('click', {'index': link['index']})
        # may or may not raise depending on timing; not asserted strictly
    except RuntimeError:
        pass
    await bridge.send('close_session')
```

- [ ] **Step 6: Run scenario**

```bash
python tools/mock_agent.py tools/scenarios/06_labeled_index.py
```

Expected: tab opens, badges visible briefly, link clicked, navigates away, scenario OK.

- [ ] **Step 7: Commit**

```bash
git add pc_agent_bridge/labeler.js pc_agent_bridge/content.js pc_agent_bridge/session.js tools/scenarios/06_labeled_index.py
git commit -m "feat(pc_agent_bridge): element labeler and read_page labeled mode"
```

---

## Task 11: Screenshot

**Files:**
- Create: `pc_agent_bridge/commands/capture.js`
- Modify: `pc_agent_bridge/background.js`
- Create: `tools/scenarios/07_screenshot.py`

- [ ] **Step 1: Write capture.js**

Create `pc_agent_bridge/commands/capture.js`:

```javascript
// commands/capture.js
export function makeCaptureCommands(session) {
  return {
    screenshot: async ({ format = 'png', quality = 80 } = {}) => {
      const tabId = session.requireRunning();
      const tab = await chrome.tabs.get(tabId);
      const opts = format === 'jpeg' ? { format: 'jpeg', quality } : { format: 'png' };
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, opts);
      return { dataUrl };
    },
  };
}
```

- [ ] **Step 2: Register in background.js**

Add import and registration:

```javascript
import { makeCaptureCommands } from './commands/capture.js';
// ...
Object.entries(makeCaptureCommands(session)).forEach(([t, fn]) => router.register(t, fn));
```

- [ ] **Step 3: Write scenario 07_screenshot.py**

Create `tools/scenarios/07_screenshot.py`:

```python
"""screenshot returns a data URL."""
async def run(bridge):
    await bridge.send('open_session', {'url': 'https://example.com'})
    r = await bridge.send('screenshot')
    assert r['dataUrl'].startswith('data:image/png;base64,'), r['dataUrl'][:60]
    assert len(r['dataUrl']) > 1000, len(r['dataUrl'])
    # jpeg
    r2 = await bridge.send('screenshot', {'format': 'jpeg', 'quality': 50})
    assert r2['dataUrl'].startswith('data:image/jpeg;base64,'), r2['dataUrl'][:60]
    await bridge.send('close_session')
```

- [ ] **Step 4: Run scenario**

```bash
python tools/mock_agent.py tools/scenarios/07_screenshot.py
```

Expected: dataUrl printed, scenario OK. The agent tab MUST be active (focused) for `captureVisibleTab` to work; `chrome.tabs.create` with `active:true` ensures this.

- [ ] **Step 5: Commit**

```bash
git add pc_agent_bridge/commands/capture.js pc_agent_bridge/background.js tools/scenarios/07_screenshot.py
git commit -m "feat(pc_agent_bridge): screenshot via captureVisibleTab"
```

---

## Task 12: webNavigation re-injection + tab_navigated event

**Files:**
- Modify: `pc_agent_bridge/session.js`
- Modify: `pc_agent_bridge/background.js`

- [ ] **Step 1: Add re-injection logic in session.js**

In `pc_agent_bridge/session.js`, add inside `createSession`, before the `return` line:

```javascript
  chrome.webNavigation.onCommitted.addListener(async (details) => {
    if (details.frameId !== 0) return;
    if (state !== 'RUNNING' || details.tabId !== agentTabId) return;
    // wait for load complete, then re-inject
    try {
      await waitForComplete(agentTabId);
      await chrome.scripting.executeScript({
        target: { tabId: agentTabId },
        files: ['labeler.js', 'content.js'],
      });
      const tab = await chrome.tabs.get(agentTabId);
      onEvent?.({ type: 'event', name: 'tab_navigated',
                  data: { url: tab.url, title: tab.title } });
    } catch (e) {
      log('re-inject failed', e);
    }
  });
```

- [ ] **Step 2: Handle in-flight commands during reinjection**

The simplest safe behavior: if `chrome.tabs.sendMessage` fails because content script is gone (during navigation), retry once after 1s. Modify `ctx.sendToContent` in `pc_agent_bridge/background.js`:

```javascript
ctx.sendToContent = async (type, params) => {
  const tabId = session.requireRunning();
  async function tryOnce() {
    return chrome.tabs.sendMessage(tabId, { type, params });
  }
  let reply;
  try {
    reply = await tryOnce();
  } catch (e) {
    // content script may be reloading after navigation
    await new Promise(r => setTimeout(r, 1000));
    try { reply = await tryOnce(); } catch (e2) {
      throw { code: 'script_error', message: 'content unreachable: ' + (e2?.message || e2) };
    }
  }
  if (!reply) throw { code: 'script_error', message: 'no reply from content' };
  if (!reply.ok) throw reply.error || { code: 'script_error', message: 'unknown error' };
  return reply.data;
};
```

- [ ] **Step 3: Manual verify in REPL**

```bash
python tools/mock_agent.py
```

Type:

```
{"type":"open_session","params":{"url":"https://example.com"}}
{"type":"navigate","params":{"url":"https://example.org"}}
{"type":"read_page","params":{"mode":"text"}}
```

Expected: `tab_navigated` event after the navigate, and `read_page` succeeds against the new page.

- [ ] **Step 4: Commit**

```bash
git add pc_agent_bridge/session.js pc_agent_bridge/background.js
git commit -m "feat(pc_agent_bridge): re-inject content script after navigation"
```

---

## Task 13: Popup UI

**Files:**
- Modify: `pc_agent_bridge/popup.html`
- Create: `pc_agent_bridge/popup.js`
- Create: `pc_agent_bridge/style.css`

- [ ] **Step 1: Write style.css**

Copy the apple-style aesthetic from existing extensions. Create `pc_agent_bridge/style.css`:

```css
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  width: 320px;
  font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #1d1d1f;
  background: #fafafa;
  padding: 12px;
}
h1 { font-size: 14px; margin-bottom: 8px; }
.row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
.label { color: #6e6e73; min-width: 64px; }
.value { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dot {
  width: 8px; height: 8px; border-radius: 50%; display: inline-block;
  background: #d2d2d7;
}
.dot.connected { background: #34c759; }
.dot.connecting { background: #ff9f0a; }
.dot.disconnected { background: #ff3b30; }
button {
  width: 100%; padding: 8px 12px; margin-top: 8px;
  border: none; border-radius: 8px; background: #007aff; color: white;
  font-size: 13px; cursor: pointer;
}
button:hover { background: #0066d6; }
button.secondary { background: #e5e5ea; color: #1d1d1f; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
input[type=text], input[type=number] {
  flex: 1; padding: 4px 6px; border: 1px solid #d2d2d7;
  border-radius: 5px; font-size: 12px;
}
.log {
  margin-top: 10px; max-height: 120px; overflow-y: auto;
  background: white; border: 1px solid #d2d2d7; border-radius: 6px;
  padding: 6px; font-family: ui-monospace, monospace; font-size: 11px;
}
.log div { padding: 1px 0; color: #424245; }
```

- [ ] **Step 2: Write popup.html**

Replace `pc_agent_bridge/popup.html`:

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>PC Agent Bridge</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>PC Agent Bridge</h1>
  <div class="row"><span class="label">Status</span>
    <span class="dot" id="dot"></span>
    <span class="value" id="status">—</span>
  </div>
  <div class="row"><span class="label">Host</span>
    <input type="text" id="host" value="127.0.0.1">
  </div>
  <div class="row"><span class="label">Port</span>
    <input type="number" id="port" value="8765" min="1" max="65535">
  </div>
  <div class="row"><span class="label">Session</span>
    <span class="value" id="session">idle</span>
  </div>
  <button id="save">Save & Reconnect</button>
  <button id="disconnect" class="secondary">Disconnect Session</button>
  <div class="log" id="log"></div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 3: Write popup.js**

Create `pc_agent_bridge/popup.js`:

```javascript
// popup.js
const $ = (id) => document.getElementById(id);
const dot = $('dot'), statusEl = $('status'), sessionEl = $('session');
const hostI = $('host'), portI = $('port'), logEl = $('log');

function render(s) {
  const status = s.wsStatus || 'disconnected';
  dot.className = 'dot ' + status;
  statusEl.textContent = status;
  hostI.value = s.wsHost || '127.0.0.1';
  portI.value = s.wsPort || 8765;
  sessionEl.textContent = s.sessionId ? `${s.sessionId} (tab ${s.agentTabId})` : 'idle';
  const lines = s.recentLog || [];
  logEl.innerHTML = '';
  for (const line of lines.slice(-30)) {
    const div = document.createElement('div');
    div.textContent = line;
    logEl.appendChild(div);
  }
  logEl.scrollTop = logEl.scrollHeight;
}

async function refresh() {
  const s = await chrome.storage.local.get(
    ['wsStatus', 'wsHost', 'wsPort', 'sessionId', 'agentTabId', 'recentLog']);
  render(s);
}

chrome.storage.onChanged.addListener(refresh);

$('save').addEventListener('click', async () => {
  const host = hostI.value.trim();
  if (host !== '127.0.0.1' && host !== 'localhost') {
    alert('Only 127.0.0.1 / localhost are allowed.');
    return;
  }
  const port = Math.max(1, Math.min(65535, parseInt(portI.value, 10) || 8765));
  await chrome.storage.local.set({ wsHost: host, wsPort: port });
  // ask SW to reload connection
  chrome.runtime.sendMessage({ type: '__reconnect__' });
});

$('disconnect').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: '__disconnect_session__' });
});

refresh();
```

- [ ] **Step 4: Handle popup messages + log persistence in background.js**

In `pc_agent_bridge/background.js`, add the following near the bottom (before the `log('loaded');` line):

```javascript
const RECENT_LOG_MAX = 30;
async function pushLog(line) {
  const { recentLog = [] } = await chrome.storage.local.get('recentLog');
  recentLog.push(`${new Date().toLocaleTimeString()} ${line}`);
  while (recentLog.length > RECENT_LOG_MAX) recentLog.shift();
  await chrome.storage.local.set({ recentLog });
}

// expose session snapshot to popup
async function syncSessionStorage() {
  const s = session.snapshot();
  await chrome.storage.local.set({ sessionId: s.sessionId, agentTabId: s.agentTabId });
}

const origOnEvent = (ev) => {
  client.send(ev);
  pushLog(`event ${ev.name}`);
  syncSessionStorage();
};
// Note: createSession was already called with onEvent: (ev) => client.send(ev).
// We need to redirect. Simplest: monkey-patch session by recreating, but cleaner:
// replace the wiring above where session is created so it uses origOnEvent.
```

Actually — to avoid the monkey-patch, change the original `createSession` call:

```javascript
const session = createSession({
  onEvent: (ev) => {
    client.send(ev);
    pushLog(`event ${ev.name}`);
    syncSessionStorage();
  },
});
```

But `client` and `pushLog` aren't defined yet at the moment of this call (hoisting). Restructure: declare `let client; let pushLogFn;` first, then assign. Cleaner: define `pushLog` as a normal function before `createSession`, and use a `setClient` indirection. Simplest pragmatic fix — declare `client` with `let` near top, assign later:

Full replacement for the body of `background.js`:

```javascript
import { createWsClient } from './ws_client.js';
import { createRouter } from './router.js';
import { makeSessionCommands } from './commands/session_cmds.js';
import { makeNavigationCommands } from './commands/navigation.js';
import { makeDomCommands } from './commands/dom.js';
import { makeCaptureCommands } from './commands/capture.js';
import { createSession } from './session.js';

const log = (...a) => console.log('[bg]', ...a);

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8765;
let cachedUrl = `ws://${DEFAULT_HOST}:${DEFAULT_PORT}`;
let client = null;

async function refreshUrl() {
  const { wsHost, wsPort } = await chrome.storage.local.get(['wsHost', 'wsPort']);
  cachedUrl = `ws://${wsHost || DEFAULT_HOST}:${wsPort || DEFAULT_PORT}`;
}

const RECENT_LOG_MAX = 30;
async function pushLog(line) {
  const { recentLog = [] } = await chrome.storage.local.get('recentLog');
  recentLog.push(`${new Date().toLocaleTimeString()} ${line}`);
  while (recentLog.length > RECENT_LOG_MAX) recentLog.shift();
  await chrome.storage.local.set({ recentLog });
}

async function syncSessionStorage(session) {
  const s = session.snapshot();
  await chrome.storage.local.set({ sessionId: s.sessionId, agentTabId: s.agentTabId });
}

const session = createSession({
  onEvent: (ev) => {
    if (client) client.send(ev);
    pushLog(`event ${ev.name}`);
    syncSessionStorage(session);
  },
});

const ctx = { session };
ctx.sendToContent = async (type, params) => {
  const tabId = session.requireRunning();
  async function tryOnce() { return chrome.tabs.sendMessage(tabId, { type, params }); }
  let reply;
  try { reply = await tryOnce(); }
  catch {
    await new Promise(r => setTimeout(r, 1000));
    try { reply = await tryOnce(); }
    catch (e2) { throw { code: 'script_error', message: 'content unreachable: ' + (e2?.message || e2) }; }
  }
  if (!reply) throw { code: 'script_error', message: 'no reply from content' };
  if (!reply.ok) throw reply.error || { code: 'script_error', message: 'unknown error' };
  return reply.data;
};

const router = createRouter();
Object.entries(makeSessionCommands(session)).forEach(([t, fn]) => router.register(t, fn));
Object.entries(makeNavigationCommands(session)).forEach(([t, fn]) => router.register(t, fn));
Object.entries(makeDomCommands(ctx)).forEach(([t, fn]) => router.register(t, fn));
Object.entries(makeCaptureCommands(session)).forEach(([t, fn]) => router.register(t, fn));

client = createWsClient({
  getUrl: () => cachedUrl,
  onMessage: async (msg) => {
    const response = await router.handle(msg, ctx);
    if (response) {
      client.send(response);
      pushLog(`<- ${msg.type} → ${response.ok ? 'ok' : 'err'}`);
    }
  },
  onStatusChange: (s) => {
    log('status', s);
    chrome.storage.local.set({ wsStatus: s });
    pushLog(`ws ${s}`);
  },
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.wsHost || changes.wsPort) refreshUrl();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === '__reconnect__') {
    refreshUrl().then(() => { client.stop(); client = createWsClient({
      getUrl: () => cachedUrl,
      onMessage: async (m) => { const r = await router.handle(m, ctx); if (r) client.send(r); },
      onStatusChange: (s) => chrome.storage.local.set({ wsStatus: s }),
    }); client.connect(); });
  } else if (msg?.type === '__disconnect_session__') {
    session.closeSession('user_disconnect');
  }
});

chrome.alarms.create('keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => {});

(async () => { await refreshUrl(); client.connect(); })();
log('loaded');
```

- [ ] **Step 5: Manual verify**

Reload extension. Click the extension icon → popup shows. Verify:
1. Status dot reflects connection (run/stop mock_agent).
2. Changing port → click "Save & Reconnect" → status changes.
3. After open_session, Session line shows `sess-... (tab N)`.
4. "Disconnect Session" closes the tab and resets.
5. Log shows recent events.

- [ ] **Step 6: Commit**

```bash
git add pc_agent_bridge/popup.html pc_agent_bridge/popup.js pc_agent_bridge/style.css pc_agent_bridge/background.js
git commit -m "feat(pc_agent_bridge): popup UI for status / config / disconnect"
```

---

## Task 14: README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add §5 to README.md**

In `README.md`, after the "### 4. 工作流倒计时" section (before the `---` and `## 🚀 快速开始`), add:

```markdown
---

### 5. PC Agent Bridge (pc_agent_bridge)

一个 WebSocket 桥接扩展，配合本地 PC agent（如 LLM 驱动的自动化程序）操控 Chrome 中一个专用 tab，实现 AI 驱动的网页自动化。

**主要功能：**
- 🔌 通过 WebSocket 连接本地 agent（默认 `ws://127.0.0.1:8765`，仅允许 127.0.0.1 / localhost）
- 🆕 agent 调用时自动创建专用 tab，所有操作隔离在该 tab 中
- 🖱 支持指令：navigate / go_back / go_forward / reload / click / type / scroll
- 📖 支持 `read_page` 文本模式与编号模式（页面叠加数字徽章，可用 index 替代 selector）
- 📸 支持 `screenshot`（可见区域）
- 🔁 自动重连、心跳保活、跨页跳转后自动重注入

**使用场景：**
- 本地 LLM agent 驱动浏览器执行任务
- 半自动化 RPA 场景下的浏览器侧执行器

**技术特点：**
- 使用 Manifest V3
- Service Worker 维护 WS 连接和会话状态机
- Content Script 处理 DOM 操作与元素编号
- 全自动模式（不拦截每一步），用户随时可点 popup 断开

**目录结构：** 参见 `pc_agent_bridge/` 与 `tools/mock_agent.py`（端到端联调用 mock agent）。

⚠ 安全提示：扩展拥有 `<all_urls>` 权限和较高自动化能力，仅在你信任本地 agent 时启用。
```

Also update the "## 📁 项目结构" tree to include `pc_agent_bridge/` and `tools/`.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add PC Agent Bridge section to README"
```

---

## Final verification

- [ ] **Run every scenario in order**

```bash
for s in tools/scenarios/0[1-7]_*.py; do
  echo "=== $s ==="
  python tools/mock_agent.py "$s" || break
done
```

Expected: all seven scenarios pass with `scenario OK`.

- [ ] **Manual smoke checklist**

1. Cold-load extension; status = connecting → disconnected (agent not running).
2. Start mock_agent; status flips to connected within 10s.
3. From REPL run `open_session` with a real URL; tab opens; popup updates.
4. Issue `read_page{mode:'labeled'}` → see red numbered badges on the page.
5. Issue `click{index: N}` → element clicked.
6. Issue `navigate` to a new URL → `tab_navigated` event arrives; labeler re-injected.
7. Close the agent tab manually → `session_closed{reason:'tab_closed'}` event.
8. Visit `chrome://settings`, call any DOM command → `unsupported_url` returned.
9. Kill mock_agent; popup shows disconnected, retry log entries appear.

If any step fails, fix before declaring done.
