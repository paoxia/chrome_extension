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
