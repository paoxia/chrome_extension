(() => {
  if (globalThis.__webReaderContentV2Loaded) return;
  globalThis.__webReaderContentV2Loaded = true;

  const BLOCK_ID_ATTR = 'data-web-reader-block-id';
  const MODE_ATTR = 'data-web-reader-translation-mode';
  const ORIGINAL_CLASS = 'web-reader-original-content';
  const TRANSLATION_CLASS = 'web-reader-translated-content';
  const TOOLBAR_ID = 'web-reader-translation-toolbar';
  const BLOCK_SELECTOR = 'h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption, dt, dd';
  const EXCLUDED_SELECTOR = 'script, style, noscript, svg, canvas, code, pre, textarea, input, select, option, [contenteditable="true"], nav, aside, footer, form, [role="navigation"]';
  const MAX_PAGE_CONTENT_LENGTH = 16000;
  const MAX_TRANSLATION_LENGTH = 28000;
  const MAX_TRANSLATION_BLOCKS = 180;

  let blockCounter = 0;
  let translationMode = 'original';
  let targetLanguage = '';

  function normalizeText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function getReadableRoot() {
    return document.querySelector('article')
      || document.querySelector('main')
      || document.querySelector('[role="main"]')
      || document.body;
  }

  function isVisible(element) {
    if (!element || element.closest(EXCLUDED_SELECTOR)) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0;
  }

  function getOriginalText(element) {
    const original = Array.from(element.children).find(child => child.classList.contains(ORIGINAL_CLASS));
    return normalizeText(original ? original.innerText || original.textContent : element.innerText || element.textContent);
  }

  function getPageContent() {
    const root = getReadableRoot();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const parts = [];
    let length = 0;
    let node;

    while ((node = walker.nextNode())) {
      const parent = node.parentElement;
      if (!parent || !isVisible(parent) || parent.closest(`.${TRANSLATION_CLASS}, #${TOOLBAR_ID}`)) continue;
      const text = normalizeText(node.textContent);
      if (!text) continue;
      parts.push(text);
      length += text.length + 1;
      if (length >= MAX_PAGE_CONTENT_LENGTH) break;
    }

    return {
      title: document.title,
      language: document.documentElement.lang || '',
      content: parts.join('\n').slice(0, MAX_PAGE_CONTENT_LENGTH)
    };
  }

  function getTranslationBlocks() {
    const root = getReadableRoot();
    const candidates = Array.from(root.querySelectorAll(BLOCK_SELECTOR)).filter((element) => {
      if (!isVisible(element) || element.closest(`#${TOOLBAR_ID}`)) return false;
      const text = getOriginalText(element);
      return text.length >= 2;
    });
    const candidateSet = new Set(candidates);
    const leafCandidates = candidates.filter((element) => {
      return !Array.from(element.querySelectorAll(BLOCK_SELECTOR)).some(child => candidateSet.has(child));
    });

    const blocks = [];
    let totalLength = 0;
    for (const element of leafCandidates) {
      if (blocks.length >= MAX_TRANSLATION_BLOCKS) break;
      const text = getOriginalText(element);
      if (!text || totalLength + text.length > MAX_TRANSLATION_LENGTH) break;

      let id = element.getAttribute(BLOCK_ID_ATTR);
      if (!id) {
        id = `web-reader-block-${++blockCounter}`;
        element.setAttribute(BLOCK_ID_ATTR, id);
      }
      blocks.push({ id, text });
      totalLength += text.length;
    }

    return {
      title: document.title,
      language: document.documentElement.lang || '',
      blocks,
      truncated: leafCandidates.length > blocks.length
    };
  }

  function ensureTranslationContainers(element) {
    let original = Array.from(element.children).find(child => child.classList.contains(ORIGINAL_CLASS));
    let translation = Array.from(element.children).find(child => child.classList.contains(TRANSLATION_CLASS));

    if (!original) {
      original = document.createElement('span');
      original.className = ORIGINAL_CLASS;
      while (element.firstChild) original.appendChild(element.firstChild);
      element.appendChild(original);
    }

    if (!translation) {
      translation = document.createElement('span');
      translation.className = TRANSLATION_CLASS;
      translation.setAttribute('dir', 'auto');
      element.appendChild(translation);
    }

    return { original, translation };
  }

  function updateToolbar() {
    const toolbar = document.getElementById(TOOLBAR_ID);
    if (!toolbar) return;
    toolbar.querySelectorAll('[data-web-reader-mode]').forEach((button) => {
      button.classList.toggle('active', button.dataset.webReaderMode === translationMode);
    });
    const label = toolbar.querySelector('.web-reader-toolbar-label');
    if (label) label.textContent = targetLanguage ? `AI 翻译 · ${targetLanguage}` : 'AI 翻译';
  }

  function setTranslationMode(mode) {
    const validMode = ['original', 'bilingual', 'translated'].includes(mode) ? mode : 'bilingual';
    translationMode = validMode;
    document.querySelectorAll(`[${BLOCK_ID_ATTR}][${MODE_ATTR}]`).forEach((element) => {
      element.setAttribute(MODE_ATTR, validMode);
    });
    updateToolbar();
    return { success: true, mode: validMode };
  }

  function ensureToolbar() {
    let toolbar = document.getElementById(TOOLBAR_ID);
    if (toolbar) {
      updateToolbar();
      return toolbar;
    }

    toolbar = document.createElement('div');
    toolbar.id = TOOLBAR_ID;
    toolbar.innerHTML = `
      <span class="web-reader-toolbar-label">AI 翻译</span>
      <button type="button" data-web-reader-mode="original">原文</button>
      <button type="button" data-web-reader-mode="bilingual">双语</button>
      <button type="button" data-web-reader-mode="translated">译文</button>
      <button type="button" class="web-reader-toolbar-close" title="移除翻译">×</button>
    `;
    toolbar.addEventListener('click', (event) => {
      event.stopPropagation();
      const modeButton = event.target.closest('[data-web-reader-mode]');
      if (modeButton) setTranslationMode(modeButton.dataset.webReaderMode);
      if (event.target.closest('.web-reader-toolbar-close')) clearTranslations();
    });
    document.documentElement.appendChild(toolbar);
    updateToolbar();
    return toolbar;
  }

  function applyTranslations(translations, mode, language) {
    let count = 0;
    for (const item of translations || []) {
      const element = document.querySelector(`[${BLOCK_ID_ATTR}="${CSS.escape(item.id)}"]`);
      if (!element || typeof item.text !== 'string' || !item.text.trim()) continue;
      const containers = ensureTranslationContainers(element);
      containers.translation.textContent = item.text.trim();
      element.setAttribute(MODE_ATTR, mode || 'bilingual');
      count++;
    }

    if (count > 0) {
      targetLanguage = language || targetLanguage;
      ensureToolbar();
      setTranslationMode(mode || 'bilingual');
    }
    return { success: count > 0, count, mode: translationMode };
  }

  function clearTranslations() {
    document.querySelectorAll(`[${BLOCK_ID_ATTR}]`).forEach((element) => {
      const original = Array.from(element.children).find(child => child.classList.contains(ORIGINAL_CLASS));
      const translation = Array.from(element.children).find(child => child.classList.contains(TRANSLATION_CLASS));
      if (original) {
        while (original.firstChild) element.insertBefore(original.firstChild, original);
        original.remove();
      }
      translation?.remove();
      element.removeAttribute(MODE_ATTR);
      element.removeAttribute(BLOCK_ID_ATTR);
    });
    document.getElementById(TOOLBAR_ID)?.remove();
    translationMode = 'original';
    targetLanguage = '';
    return { success: true, count: 0, mode: translationMode };
  }

  function getTranslationState() {
    const count = document.querySelectorAll(`[${MODE_ATTR}]`).length;
    return { active: count > 0, count, mode: translationMode, targetLanguage };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'webReaderPing') sendResponse({ ready: true });
    else if (message.action === 'getPageContent') sendResponse(getPageContent());
    else if (message.action === 'getTranslationBlocks') sendResponse(getTranslationBlocks());
    else if (message.action === 'applyTranslations') {
      sendResponse(applyTranslations(message.translations, message.mode, message.targetLanguage));
    } else if (message.action === 'setTranslationMode') sendResponse(setTranslationMode(message.mode));
    else if (message.action === 'clearTranslations') sendResponse(clearTranslations());
    else if (message.action === 'getTranslationState') sendResponse(getTranslationState());
    else return false;
    return true;
  });
})();
