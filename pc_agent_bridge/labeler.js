// labeler.js — loaded before content.js in agent tab; attaches to window.__pcAgent
(() => {
  const SELECTOR = [
    'a[href]','button','input:not([type="hidden"])','select','textarea',
    '[role="button"]','[role="link"]','[role="checkbox"]','[role="radio"]',
    '[role="tab"]','[role="menuitem"]',
    '[contenteditable=""]','[contenteditable="true"]','[onclick]',
  ].join(',');
  const OVERLAY_ID = '__pc_agent_overlay__';

  function isVisible(el) {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (r.bottom < 0 || r.right < 0) return false;
    if (r.top > innerHeight || r.left > innerWidth) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  }

  function getName(el) {
    return el.getAttribute('aria-label') || el.getAttribute('alt') ||
      el.getAttribute('title') || el.getAttribute('placeholder') ||
      (el.innerText || '').trim().slice(0, 60) || el.getAttribute('name') || '';
  }

  function clearOverlay() {
    const o = document.getElementById(OVERLAY_ID);
    if (o) o.remove();
  }

  function scanAndLabel() {
    clearOverlay();
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    Object.assign(overlay.style, {
      position: 'fixed', top: '0', left: '0', width: '0', height: '0',
      zIndex: '2147483647', pointerEvents: 'none',
    });
    document.documentElement.appendChild(overlay);

    const elements = [];
    const map = new Map();
    let idx = 0;
    for (const el of document.querySelectorAll(SELECTOR)) {
      if (!isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      elements.push({
        index: idx,
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || '',
        name: getName(el),
        text: (el.innerText || '').trim().slice(0, 80),
        bbox: { x: Math.round(rect.left), y: Math.round(rect.top),
                w: Math.round(rect.width), h: Math.round(rect.height) },
      });
      map.set(idx, el);
      const badge = document.createElement('div');
      badge.textContent = String(idx);
      Object.assign(badge.style, {
        position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
        background: 'rgba(255,80,80,0.85)', color: 'white',
        font: 'bold 11px/14px monospace', padding: '1px 4px',
        borderRadius: '3px', pointerEvents: 'none',
      });
      overlay.appendChild(badge);
      idx++;
    }
    return { elements, map };
  }

  window.__pcAgent = window.__pcAgent || {};
  window.__pcAgent.scanAndLabel = scanAndLabel;
  window.__pcAgent.clearOverlay = clearOverlay;
})();
