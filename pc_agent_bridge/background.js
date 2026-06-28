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
