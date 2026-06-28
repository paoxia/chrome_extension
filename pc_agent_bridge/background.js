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
  return createWsClient({
    getUrl: () => cachedUrl,
    onMessage: async (msg) => {
      const response = await router.handle(msg, ctx);
      if (response) {
        client.send(response);
        pushLog(`<- ${msg.type} \u2192 ${response.ok ? 'ok' : 'err'}`);
      }
    },
    onStatusChange: (s) => {
      log('status', s);
      chrome.storage.local.set({ wsStatus: s });
      pushLog(`ws ${s}`);
    },
  });
}

client = createClient();

chrome.storage.onChanged.addListener((changes) => {
  if (changes.wsHost || changes.wsPort) refreshUrl();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === '__reconnect__') {
    refreshUrl().then(() => {
      if (client) client.stop();
      client = createClient();
      client.connect();
    });
  } else if (msg?.type === '__disconnect_session__') {
    session.closeSession('user_disconnect');
  }
});

chrome.alarms.create('keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => {});

(async () => { await refreshUrl(); client.connect(); })();
log('loaded');
