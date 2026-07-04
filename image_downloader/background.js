let detectedImages = [];
let imageIdCounter = 0;
let tabTitleCache = {};

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.jfif'];
const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/bmp',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/jfif'
];

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
    if (filename && filename.length > 3) {
      return decodeURIComponent(filename);
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

async function fetchImageInfo(url) {
  try {
    const cleanUrl = cleanTwitterUrl(url);
    const headers = {};
    if (cleanUrl.includes('pbs.twimg.com')) {
      headers['Referer'] = 'https://twitter.com/';
      headers['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    }

    const response = await fetch(cleanUrl, { 
      method: 'HEAD', 
      redirect: 'follow',
      headers: headers
    });
    const contentLength = response.headers.get('Content-Length');
    const contentType = response.headers.get('Content-Type');
    return {
      size: contentLength ? parseInt(contentLength) : null,
      type: contentType || ''
    };
  } catch (error) {
    return { size: null, type: '' };
  }
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

  if (message.action === 'getAllImages') {
    sendResponse({ images: detectedImages });
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

  if (message.action === 'downloadAll') {
    const { images } = message;
    let successCount = 0;
    let failCount = 0;
    let completedCount = 0;
    const total = images.length;

    images.forEach((image, index) => {
      setTimeout(() => {
        const cleanUrl = cleanTwitterUrl(image.url);
        const downloadOptions = {
          url: cleanUrl,
          filename: image.filename,
          conflictAction: 'uniquify'
        };

        if (cleanUrl.includes('pbs.twimg.com')) {
          downloadOptions.headers = [
            { name: 'Referer', value: 'https://twitter.com/' },
            { name: 'User-Agent', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
          ];
        }

        chrome.downloads.download(downloadOptions, (downloadId) => {
          completedCount++;
          if (downloadId) {
            successCount++;
          } else {
            failCount++;
          }

          if (completedCount === total) {
            sendResponse({ success: true, successCount, failCount, total });
          }
        });
      }, index * 300);
    });

    return true;
  }

  if (message.action === 'copyUrl') {
    const { url } = message;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: (url) => {
            navigator.clipboard.writeText(url).then(() => {
              console.log('URL copied');
            }).catch(() => {
              const textarea = document.createElement('textarea');
              textarea.value = url;
              document.body.appendChild(textarea);
              textarea.select();
              document.execCommand('copy');
              document.body.removeChild(textarea);
            });
          },
          args: [url]
        }).then(() => {
          sendResponse({ success: true });
        }).catch((error) => {
          sendResponse({ success: false, error: error.message });
        });
      } else {
        sendResponse({ success: false, error: '没有活动标签页' });
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

  if (message.action === 'scanPage') {
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

              if (newImage.size === null) {
                fetchImageInfo(newImage.url).then(info => {
                  if (info.size !== null) {
                    newImage.size = info.size;
                    newImage.mimeType = info.type;
                    chrome.storage.local.set({ images: detectedImages });
                  }
                });
              }
            }
          });
          chrome.storage.local.set({ images: detectedImages });
          sendResponse({ success: true, count: response.images.length });
        } else {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: scanPageFallback
          }).then((results) => {
            if (results && results[0] && results[0].result) {
              results[0].result.forEach(img => {
                const existing = detectedImages.find(i => i.url === img.url);
                if (!existing) {
                  const newImage = {
                    id: ++imageIdCounter,
                    url: img.url,
                    filename: getFilename(img.url, displayTitle),
                    title: displayTitle,
                    size: img.size || null,
                    width: img.width || null,
                    height: img.height || null,
                    mimeType: img.mimeType || '',
                    tabId: tab.id,
                    timestamp: Date.now()
                  };
                  detectedImages.push(newImage);

                  if (newImage.size === null) {
                    fetchImageInfo(newImage.url).then(info => {
                      if (info.size !== null) {
                        newImage.size = info.size;
                        newImage.mimeType = info.type;
                        chrome.storage.local.set({ images: detectedImages });
                      }
                    });
                  }
                }
              });
              chrome.storage.local.set({ images: detectedImages });
            }
            sendResponse({ success: true });
          }).catch((error) => {
            console.error('扫描页面失败:', error);
            sendResponse({ success: false, error: error.message });
          });
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

          if (newImage.size === null) {
            fetchImageInfo(newImage.url).then(info => {
              if (info.size !== null) {
                newImage.size = info.size;
                newImage.mimeType = info.type;
                chrome.storage.local.set({ images: detectedImages });
              }
            });
          }
        }
      });
      chrome.storage.local.set({ images: detectedImages });
    }
    sendResponse({ success: true });
    return true;
  }

  return false;
});

chrome.storage.local.get(['images'], (result) => {
  if (result.images) {
    detectedImages = result.images.filter(img => Date.now() - img.timestamp < 3600000);
  }
});

function scanPageFallback() {
  const images = [];
  const urlSet = new Set();

  document.querySelectorAll('img').forEach(img => {
    const src = img.src || img.dataset.src || img.dataset.srcset;
    if (src && src.startsWith('http') && !src.includes('data:')) {
      const url = src.split(' ')[0];
      if (!urlSet.has(url)) {
        urlSet.add(url);
        images.push({
          url: url,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height
        });
      }
    }
  });

  const links = document.querySelectorAll('a');
  links.forEach(link => {
    const href = link.href || '';
    if (href && href.startsWith('http') && isImageUrl(href)) {
      if (!urlSet.has(href)) {
        urlSet.add(href);
        images.push({ url: href });
      }
    }
  });

  return images;
}