(() => {
'use strict';

let detectedImages = [];
let imageIdCounter = 0;
let tabTitleCache = {};

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.jfif'];

function isImageUrl(url) {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.startsWith('data:')) return false;
  if (lowerUrl.startsWith('blob:')) return false;
  if (lowerUrl.includes('chrome-extension:')) return false;
  if (IMAGE_EXTENSIONS.some(ext => lowerUrl.includes(ext))) return true;
  if (lowerUrl.includes('pbs.twimg.com') && lowerUrl.includes('format=')) {
    const formatMatch = lowerUrl.match(/format=([a-z]+)/);
    if (formatMatch && IMAGE_EXTENSIONS.some(ext => ext === '.' + formatMatch[1])) {
      return true;
    }
  }
  return false;
}

function getImageExtension(url) {
  for (const ext of IMAGE_EXTENSIONS) {
    if (url.toLowerCase().includes(ext)) {
      return ext;
    }
  }
  if (url.toLowerCase().includes('pbs.twimg.com') && url.toLowerCase().includes('format=')) {
    const formatMatch = url.toLowerCase().match(/format=([a-z]+)/);
    if (formatMatch) {
      const ext = '.' + formatMatch[1];
      if (IMAGE_EXTENSIONS.includes(ext)) {
        return ext;
      }
    }
  }
  return '.jpg';
}

function getFilename(url, title = '') {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    let filename = pathname.split('/').pop();
    if (filename && filename.length > 0) {
      filename = decodeURIComponent(filename);
      const hasExtension = IMAGE_EXTENSIONS.some(ext => filename.toLowerCase().endsWith(ext));
      if (!hasExtension) {
        const formatMatch = url.toLowerCase().match(/format=([a-z]+)/);
        if (formatMatch) {
          const ext = '.' + formatMatch[1];
          if (IMAGE_EXTENSIONS.includes(ext)) {
            return filename + ext;
          }
        }
      }
      return filename;
    }
  } catch (e) {}
  const ext = getImageExtension(url);
  if (title) {
    const cleanTitle = title.replace(/[\\/:*?"<>|]/g, '_');
    return cleanTitle + '_' + Date.now() + ext;
  }
  return 'image_' + Date.now() + ext;
}

function cleanTwitterUrl(url) {
  return url.replace(/&amp;/g, '&');
}

// 获取图片文件大小（字节）。优先用 Content-Length 头，缺失则读取 blob。
async function fetchImageSize(url) {
  try {
    const response = await fetch(url, { method: 'GET', credentials: 'omit' });
    if (!response.ok) return null;
    const contentLength = response.headers.get('Content-Length');
    if (contentLength) {
      try { response.body?.cancel(); } catch (e) {}
      const size = parseInt(contentLength, 10);
      return isNaN(size) ? null : size;
    }
    const blob = await response.blob();
    return blob.size || null;
  } catch (e) {
    return null;
  }
}

// 为未获取过大小的图片异步获取文件大小
let enriching = false;
function enrichImageSizes() {
  if (enriching) return;
  const pending = detectedImages.filter(img => img.size == null);
  if (pending.length === 0) return;
  enriching = true;

  const CONCURRENCY = 4;
  let index = 0;
  let changed = false;
  let reported = 0;

  function notify() {
    if (!changed) return;
    chrome.storage.local.set({ images: detectedImages });
    chrome.runtime.sendMessage({ action: 'imageDetected' }).catch(() => {});
  }

  async function worker() {
    while (index < pending.length) {
      const img = pending[index++];
      const size = await fetchImageSize(img.url);
      if (size != null && size > 0) {
        img.size = size;
        changed = true;
      }
      reported++;
      // 每获取 5 个或全部完成时刷新一次显示
      if (reported % 5 === 0) notify();
    }
  }

  Promise.all(Array.from({ length: Math.min(CONCURRENCY, pending.length) }, worker)).then(() => {
    enriching = false;
    notify();
  });
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.title) {
    tabTitleCache[tabId] = changeInfo.title;
  }
  if (changeInfo.url) {
    detectedImages = detectedImages.filter(img => img.tabId !== tabId);
    chrome.storage.local.set({ images: detectedImages });
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab) {
      tabTitleCache[tab.id] = tab.title || '';
    }
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  detectedImages = detectedImages.filter(img => img.tabId !== tabId);
  delete tabTitleCache[tabId];
  chrome.storage.local.set({ images: detectedImages });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getImages') {
    const currentTabId = message.tabId;
    const tabImages = detectedImages.filter(img => img.tabId === currentTabId);
    sendResponse({ images: tabImages });
    return true;
  }

  if (message.action === 'downloadImage') {
    const { url, filename } = message;
    const cleanUrl = cleanTwitterUrl(url);

    const downloadOptions = {
      url: cleanUrl,
      filename: filename,
      conflictAction: 'uniquify'
    };

    if (cleanUrl.includes('pbs.twimg.com')) {
      downloadOptions.headers = [
        { name: 'Referer', value: 'https://twitter.com/' },
        { name: 'User-Agent', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
      ];
    }

    chrome.downloads.download(downloadOptions, (downloadId) => {
      if (downloadId) {
        sendResponse({ success: true, downloadId: downloadId });
      } else {
        sendResponse({ success: false, error: chrome.runtime.lastError?.message || '下载失败' });
      }
    });
    return true;
  }

  if (message.action === 'clearImages') {
    detectedImages = [];
    chrome.storage.local.remove('images');
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'scanImagesPage') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        sendResponse({ success: false, error: '没有活动标签页' });
        return;
      }
      const tab = tabs[0];
      const pageTitle = tab.title || '';
      const cleanTitle = pageTitle.replace(/[-_|·]/g, ' ').trim();
      const displayTitle = cleanTitle.length > 50 ? cleanTitle.substring(0, 50) + '...' : cleanTitle;

      chrome.tabs.sendMessage(tab.id, { action: 'scanImages' }, (response) => {
        if (response && response.images) {
          response.images.forEach(img => {
            const existing = detectedImages.find(i => i.url === img.url);
            if (!existing) {
              const newImage = {
                id: ++imageIdCounter,
                url: img.url,
                filename: img.filename || getFilename(img.url, displayTitle),
                title: img.title || displayTitle,
                size: img.size || null,
                width: img.width || null,
                height: img.height || null,
                mimeType: img.mimeType || '',
                tabId: tab.id,
                timestamp: Date.now()
              };
              detectedImages.push(newImage);
            }
          });
          chrome.storage.local.set({ images: detectedImages });
          sendResponse({ success: true, count: response.images.length });
          enrichImageSizes();
        } else {
          sendResponse({ success: true });
        }
      });
    });
    return true;
  }

  if (message.action === 'imageDetected') {
    if (message.images && Array.isArray(message.images)) {
      message.images.forEach(img => {
        const existing = detectedImages.find(i => i.url === img.url);
        if (!existing) {
          const tabId = sender.tab?.id || 0;
          const cachedTitle = tabTitleCache[tabId] || img.title || '';
          const cleanTitle = cachedTitle.replace(/[-_|·]/g, ' ').trim();
          const displayTitle = cleanTitle.length > 50 ? cleanTitle.substring(0, 50) + '...' : cleanTitle;

          const newImage = {
            id: ++imageIdCounter,
            url: img.url,
            filename: img.filename || getFilename(img.url, displayTitle),
            title: displayTitle,
            size: img.size || null,
            width: img.width || null,
            height: img.height || null,
            mimeType: img.mimeType || '',
            tabId: tabId,
            timestamp: Date.now()
          };
          detectedImages.push(newImage);
        }
      });
      chrome.storage.local.set({ images: detectedImages });
    }
    sendResponse({ success: true });
    enrichImageSizes();
    return true;
  }

  return false;
});

chrome.storage.local.get(['images'], (result) => {
  if (result.images) {
    detectedImages = result.images.filter(img => Date.now() - img.timestamp < 3600000);
  }
});

})();
