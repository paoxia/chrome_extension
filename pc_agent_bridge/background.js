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
let clientGen = 0;

const storageArea = chrome.storage.session ?? chrome.storage.local;

async function refreshUrl() {
  const { wsHost, wsPort } = await chrome.storage.local.get(['wsHost', 'wsPort']);
  cachedUrl = `ws://${wsHost || DEFAULT_HOST}:${wsPort || DEFAULT_PORT}`;
}

const RECENT_LOG_MAX = 30;
let recentLog = [];
function pushLog(line) {
  recentLog.push(`${new Date().toLocaleTimeString()} ${line}`);
  if (recentLog.length > RECENT_LOG_MAX) {
    recentLog = recentLog.slice(-RECENT_LOG_MAX);
  }
  storageArea.set({ recentLog }).catch((e) => console.warn('[bg] log persist', e));
}

function syncSessionStorage() {
  storageArea.set({ sessionSnapshot: session.snapshot() })
    .catch((e) => console.warn('[bg] session persist', e));
}

const session = createSession({
  onEvent: (ev) => {
    if (client) client.send(ev);
    pushLog(`event ${ev.name}`);
    syncSessionStorage();
  },
});

const ctx = { session };
ctx.sendToContent = async (type, params) => {
  const tabId = session.requireRunning();
  async function attempt() { return chrome.tabs.sendMessage(tabId, { type, params }); }
  let reply;
  try {
    reply = await attempt();
  } catch (e) {
    const msg = String(e?.message ?? e);
    if (/tab was closed|No tab with id/i.test(msg)) {
      throw { code: 'tab_lost', message: msg };
    }
    await new Promise((r) => setTimeout(r, 1000));
    try {
      reply = await attempt();
    } catch (e2) {
      const msg2 = String(e2?.message ?? e2);
      if (/tab was closed|No tab with id/i.test(msg2)) {
        throw { code: 'tab_lost', message: msg2 };
      }
      throw { code: 'script_error', message: 'content script unreachable: ' + msg2 };
    }
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

function createClient() {
  const myGen = ++clientGen;
  const self = createWsClient({
    getUrl: () => cachedUrl,
    onMessage: async (msg) => {
      if (myGen !== clientGen) return;
      const response = await router.handle(msg, ctx);
      if (myGen !== clientGen) return;
      if (response) {
        self.send(response);
        pushLog(`<- ${msg.type} \u2192 ${response.ok ? 'ok' : 'err'}`);
      }
    },
    onStatusChange: (s) => {
      if (myGen !== clientGen) return;
      log('status', s);
      storageArea.set({ wsState: s }).catch((e) => console.warn('[bg] wsState persist', e));
      pushLog(`ws ${s}`);
    },
  });
  return self;
}

client = createClient();

chrome.storage.onChanged.addListener((changes) => {
  if (changes.wsHost || changes.wsPort) refreshUrl();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === '__reconnect__') {
    (async () => {
      try {
        await refreshUrl();
        if (client) client.stop();
        client = createClient();
        client.connect();
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message ?? e) });
      }
    })();
    return true;
  } else if (msg?.type === '__disconnect_session__') {
    (async () => {
      try {
        await session.closeSession('user_disconnect');
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message ?? e) });
      }
    })();
    return true;
  }
});

chrome.alarms.create('keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => {});

(async () => {
  try {
    await refreshUrl();
  } catch (e) {
    console.warn('[bg] refreshUrl initial', e);
  }
  client.connect();
})();
log('loaded');
