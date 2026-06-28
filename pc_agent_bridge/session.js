// session.js — single-session state machine
const log = (...a) => console.log('[session]', ...a);

export function createSession({ onEvent }) {
  let state = 'IDLE';     // IDLE | OPENING | RUNNING
  let agentTabId = null;
  let sessionId = null;

  function snapshot() {
    return { state, agentTabId, sessionId };
  }

  async function openSession({ url } = {}) {
    if (state !== 'IDLE') {
      throw { code: 'session_busy', message: 'a session is already active' };
    }
    state = 'OPENING';
    let tab;
    try {
      tab = await chrome.tabs.create({ url: url || 'about:blank', active: true });
    } catch (err) {
      log('open failed, rolling back to IDLE', err);
      state = 'IDLE'; agentTabId = null; sessionId = null;
      throw err;
    }
    agentTabId = tab.id;
    try {
      await waitForComplete(tab.id);
    } catch (err) {
      log('open failed, rolling back to IDLE', err);
      if (err && err.code === 'tab_closed_during_load') {
        try { await chrome.tabs.remove(tab.id); } catch {}
      }
      state = 'IDLE'; agentTabId = null; sessionId = null;
      throw err;
    }
    sessionId = `sess-${Date.now()}`;
    state = 'RUNNING';
    log('opened', { agentTabId, sessionId });
    onEvent?.({ type: 'event', name: 'session_opened',
                data: { tabId: agentTabId, sessionId } });
    return { tabId: agentTabId, sessionId };
  }

  async function closeSession(reason = 'agent_request') {
    if (state !== 'RUNNING' && state !== 'OPENING') return {};
    const tabId = agentTabId;
    state = 'IDLE'; agentTabId = null; sessionId = null;
    try { if (tabId) await chrome.tabs.remove(tabId); } catch {}
    log('closed', reason);
    onEvent?.({ type: 'event', name: 'session_closed', data: { reason } });
    return {};
  }

  function waitForComplete(tabId) {
    return new Promise((resolve, reject) => {
      function cleanup() {
        chrome.tabs.onUpdated.removeListener(onUpdated);
        chrome.tabs.onRemoved.removeListener(onRemoved);
      }
      function onUpdated(id, info) {
        if (id === tabId && info.status === 'complete') {
          cleanup();
          resolve();
        }
      }
      function onRemoved(id) {
        if (id === tabId) {
          cleanup();
          reject({ code: 'tab_closed_during_load', message: 'tab closed before navigation completed' });
        }
      }
      chrome.tabs.onUpdated.addListener(onUpdated);
      chrome.tabs.onRemoved.addListener(onRemoved);
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
