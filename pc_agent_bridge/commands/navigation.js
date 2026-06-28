const NAV_TIMEOUT_MS = 30000;

function waitForComplete(tabId, timeoutMs = NAV_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    function cleanup() {
      clearTimeout(timer);
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
        reject({ code: 'tab_lost', message: 'tab closed during navigation' });
      }
    }
    const timer = setTimeout(() => {
      cleanup();
      reject({ code: 'nav_failed', message: 'navigation timeout' });
    }, timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);
  });
}

async function tabInfo(tabId) {
  const t = await chrome.tabs.get(tabId);
  return { url: t.url, title: t.title };
}

export function makeNavigationCommands(session) {
  async function nav(action, { url } = {}) {
    const tabId = session.requireRunning();
    if (action === 'navigate') {
      if (!url) throw { code: 'bad_params', message: 'url required' };
      await chrome.tabs.update(tabId, { url });
    } else if (action === 'go_back') {
      await chrome.tabs.goBack(tabId);
    } else if (action === 'go_forward') {
      await chrome.tabs.goForward(tabId);
    } else if (action === 'reload') {
      await chrome.tabs.reload(tabId);
    }
    await waitForComplete(tabId);
    return tabInfo(tabId);
  }
  return {
    navigate:   (p) => nav('navigate', p),
    go_back:    ()  => nav('go_back'),
    go_forward: ()  => nav('go_forward'),
    reload:     ()  => nav('reload'),
  };
}
