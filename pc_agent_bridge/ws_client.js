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
