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

async function refreshUrl() {
  const { wsHost, wsPort } = await chrome.storage.local.get(['wsHost', 'wsPort']);
  cachedUrl = `ws://${wsHost || DEFAULT_HOST}:${wsPort || DEFAULT_PORT}`;
}

const session = createSession({
  onEvent: (ev) => client.send(ev),
});

const router = createRouter();
Object.entries(makeSessionCommands(session)).forEach(([t, fn]) => router.register(t, fn));
Object.entries(makeNavigationCommands(session)).forEach(([t, fn]) => router.register(t, fn));

const ctx = { session };

ctx.sendToContent = async (type, params) => {
  const tabId = session.requireRunning();
  async function attempt() {
    return chrome.tabs.sendMessage(tabId, { type, params });
  }
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

Object.entries(makeDomCommands(ctx)).forEach(([t, fn]) => router.register(t, fn));
Object.entries(makeCaptureCommands(session)).forEach(([t, fn]) => router.register(t, fn));

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
