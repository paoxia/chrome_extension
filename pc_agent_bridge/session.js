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
