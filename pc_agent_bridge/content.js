// content.js — runs in agent tab
const log = (...a) => console.log('[content]', ...a);

const handlers = {
  hello: async () => ({ ok: true, url: location.href, title: document.title }),
};

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const fn = handlers[msg.type];
  if (!fn) {
    sendResponse({ ok: false, error: { code: 'bad_params', message: `no handler: ${msg.type}` } });
    return false;
  }
  Promise.resolve(fn(msg.params || {}))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => sendResponse({ ok: false,
      error: e?.code ? e : { code: 'script_error', message: String(e?.message || e) } }));
  return true; // async response
});

log('loaded on', location.href);
