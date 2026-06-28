const $ = (id) => document.getElementById(id);
const dot = $('dot'), statusEl = $('status'), sessionEl = $('session');
const hostI = $('host'), portI = $('port'), logEl = $('log');
const hostErr = $('hostError'), portErr = $('portError');

const storageArea = chrome.storage.session ?? chrome.storage.local;
const WATCHED_KEYS = ['wsState', 'wsHost', 'wsPort', 'sessionSnapshot', 'recentLog'];

function renderSession(snap) {
  if (!snap || !snap.state || snap.state === 'IDLE') {
    sessionEl.textContent = 'no session';
    return;
  }
  if (snap.state === 'OPENING') {
    sessionEl.textContent = 'opening\u2026';
    return;
  }
  if (snap.state === 'RUNNING') {
    sessionEl.textContent = `tabId: ${snap.agentTabId} | sessionId: ${snap.sessionId}`;
    return;
  }
  sessionEl.textContent = 'no session';
}

function render(s) {
  const status = s.wsState || 'disconnected';
  dot.className = 'dot ' + status;
  statusEl.textContent = status;
  if (document.activeElement !== hostI) hostI.value = s.wsHost || '127.0.0.1';
  if (document.activeElement !== portI) portI.value = s.wsPort || 8765;
  renderSession(s.sessionSnapshot);
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
  let s;
  try {
    s = await storageArea.get(WATCHED_KEYS);
  } catch {
    s = await chrome.storage.local.get(WATCHED_KEYS);
  }
  // host/port live in chrome.storage.local (popup writes them there); merge those if not present
  if (s.wsHost === undefined || s.wsPort === undefined) {
    const cfg = await chrome.storage.local.get(['wsHost', 'wsPort']);
    if (s.wsHost === undefined) s.wsHost = cfg.wsHost;
    if (s.wsPort === undefined) s.wsPort = cfg.wsPort;
  }
  render(s);
}

chrome.storage.onChanged.addListener((changes) => {
  const touched = WATCHED_KEYS.some((k) => Object.prototype.hasOwnProperty.call(changes, k));
  if (touched) refresh();
});

function showError(el, msg) {
  el.textContent = msg;
  el.hidden = false;
}
function clearError(el) {
  el.textContent = '';
  el.hidden = true;
}

$('save').addEventListener('click', async () => {
  clearError(hostErr);
  clearError(portErr);
  const host = hostI.value.trim();
  if (host !== '127.0.0.1' && host !== 'localhost') {
    showError(hostErr, 'Only 127.0.0.1 / localhost are allowed.');
    return;
  }
  const rawPort = parseInt(portI.value, 10);
  if (Number.isNaN(rawPort) || rawPort < 1 || rawPort > 65535) {
    showError(portErr, 'Port must be an integer between 1 and 65535.');
    return;
  }
  await chrome.storage.local.set({ wsHost: host, wsPort: rawPort });
  chrome.runtime.sendMessage({ type: '__reconnect__' }, (resp) => {
    if (chrome.runtime.lastError) {
      showError(hostErr, chrome.runtime.lastError.message);
      return;
    }
    if (resp && resp.ok === false) {
      showError(hostErr, resp.error || 'reconnect failed');
    }
  });
});

$('disconnect').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: '__disconnect_session__' }, () => {
    void chrome.runtime.lastError;
  });
});

refresh();
