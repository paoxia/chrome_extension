export function makeCaptureCommands(session) {
  return {
    screenshot: async ({ format = 'png', quality = 80 } = {}) => {
      const tabId = session.requireRunning();
      const tab = await chrome.tabs.get(tabId);
      const opts = format === 'jpeg' ? { format: 'jpeg', quality } : { format: 'png' };
      const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, opts);
      return { dataUrl };
    },
  };
}
