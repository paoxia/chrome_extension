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
  chrome.runtime.sendMessage({ type: '__reconnect__' });
});

$('disconnect').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: '__disconnect_session__' });
});

refresh();
