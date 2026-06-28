// content.js — runs in agent tab
// Reply envelope: { ok: true, data } | { ok: false, error: { code, message } }
const log = (...a) => console.log('[content]', ...a);

let labeledMap = new Map(); // index -> element (populated by labeler in Task 10)

function resolveElement({ selector, index }) {
  if (selector && typeof selector === 'string') {
    const el = document.querySelector(selector);
    if (!el) throw { code: 'element_not_found', message: `no match: ${selector}` };
    return el;
  }
  if (typeof index === 'number') {
    const el = labeledMap.get(index);
    if (!el || !el.isConnected) throw { code: 'element_not_found', message: `bad index: ${index}` };
    return el;
  }
  throw { code: 'bad_params', message: 'selector or index required' };
}

function ensureInteractable(el) {
  const rect = el.getBoundingClientRect();
  const visible = rect.width > 0 && rect.height > 0;
  const style = getComputedStyle(el);
  const displayed = style.visibility !== 'hidden' && style.display !== 'none';
  if (!visible || !displayed) {
    throw { code: 'element_not_interactable', message: 'element not visible' };
  }
  if (el.disabled) {
    throw { code: 'element_not_interactable', message: 'element disabled' };
  }
}

const handlers = {
  click: async (p) => {
    const el = resolveElement(p);
    ensureInteractable(el);
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.click();
    return {};
  },

  type: async ({ selector, index, text, clear = true }) => {
    if (typeof text !== 'string') throw { code: 'bad_params', message: 'text required' };
    const el = resolveElement({ selector, index });
    ensureInteractable(el);
    el.focus();
    const isInput = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
    if (isInput) {
      const proto = el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      const base = clear ? '' : el.value;
      setter.call(el, base + text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.isContentEditable) {
      const base = clear ? '' : el.textContent;
      el.textContent = base + text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
    } else {
      throw { code: 'element_not_interactable', message: 'not an input or contenteditable' };
    }
    return {};
  },

  scroll: async ({ selector, index, y }) => {
    if (typeof y === 'number') {
      window.scrollBy({ top: y, behavior: 'instant' });
      return {};
    }
    const el = resolveElement({ selector, index });
    el.scrollIntoView({ block: 'center', inline: 'center' });
    return {};
  },
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
  return true;
});

log('loaded on', location.href);
