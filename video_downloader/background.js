let detectedVideos = [];
let videoIdCounter = 0;
let tabTitleCache = {};

const VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/mkv',
  'video/avi',
  'video/mov',
  'video/flv',
  'video/wmv',
  'video/ogg',
  'video/quicktime',
  'video/x-matroska',
  'application/x-mpegURL',
  'application/vnd.apple.mpegurl'
];

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv', '.ogg', '.m3u8'];

const MIME_EXTENSION_MAP = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/x-matroska': '.mkv',
  'video/avi': '.avi',
  'video/x-msvideo': '.avi',
  'video/quicktime': '.mov',
  'video/x-flv': '.flv',
  'video/x-ms-wmv': '.wmv',
  'video/ogg': '.ogg',
  'application/x-mpegurl': '.m3u8',
  'application/vnd.apple.mpegurl': '.m3u8'
};

function isVideoUrl(url) {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('blob:')) return true;
  if (lowerUrl.includes('data:')) return false;
  return VIDEO_EXTENSIONS.some(ext => lowerUrl.includes(ext));
}

function getVideoExtension(url, mimeType = '', filename = '') {
  const lowerFilename = filename.toLowerCase();
  const filenameExtension = VIDEO_EXTENSIONS.find(ext => lowerFilename.endsWith(ext));
  if (filenameExtension) return filenameExtension;

  const normalizedMimeType = mimeType.split(';')[0].trim().toLowerCase();
  if (MIME_EXTENSION_MAP[normalizedMimeType]) {
    return MIME_EXTENSION_MAP[normalizedMimeType];
  }

  for (const ext of VIDEO_EXTENSIONS) {
    if (url.toLowerCase().includes(ext)) {
      return ext;
    }
  }
  return '.mp4';
}

async function fetchVideoSize(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const contentLength = response.headers.get('Content-Length');
    return contentLength ? parseInt(contentLength) : null;
  } catch (error) {
    console.error('获取视频大小失败:', error);
    return null;
  }
}

async function updateVideoSize(video) {
  if (video.size !== null) return;
  try {
    const size = await fetchVideoSize(video.url);
    if (size !== null) {
      video.size = size;
      chrome.storage.local.set({ 
        videos: detectedVideos.filter(v => Date.now() - v.timestamp < 3600000)
      });
      chrome.runtime.sendMessage({
        action: 'videoSizeUpdated',
        video: video
      }).catch(() => {});
    }
  } catch (error) {
    console.error('更新视频大小失败:', error);
  }
}

function decodeFilename(filename) {
  try {
    return decodeURIComponent(filename);
  } catch (e) {
    return filename;
  }
}

function sanitizeFilename(filename) {
  if (!filename) return '';

  let sanitized = decodeFilename(filename)
    .replace(/[\u0000-\u001f\u0080-\u009f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/[. ]+$/g, '')
    .trim();

  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(sanitized)) {
    sanitized = '_' + sanitized;
  }

  return sanitized.substring(0, 180);
}

function hasVideoExtension(filename) {
  const lowerFilename = filename.toLowerCase();
  return VIDEO_EXTENSIONS.some(ext => lowerFilename.endsWith(ext));
}

function isUsefulFilename(filename) {
  if (!filename) return false;
  const extension = VIDEO_EXTENSIONS.find(ext => filename.toLowerCase().endsWith(ext)) || '';
  const basename = extension ? filename.slice(0, -extension.length) : filename;

  if (basename.length < 2 || /^\d+$/.test(basename)) return false;
  if (/^[a-f0-9]{20,}$/i.test(basename)) return false;
  return true;
}

function withVideoExtension(filename, extension) {
  return hasVideoExtension(filename) ? filename : filename + extension;
}

function getContentDispositionFilename(responseHeaders = []) {
  const header = responseHeaders.find(h => h.name.toLowerCase() === 'content-disposition');
  if (!header?.value) return '';

  const extendedMatch = header.value.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i);
  if (extendedMatch) {
    return decodeFilename(extendedMatch[1].trim().replace(/^['"]|['"]$/g, ''));
  }

  const basicMatch = header.value.match(/filename\s*=\s*(?:"([^"]+)"|([^;]+))/i);
  return basicMatch ? (basicMatch[1] || basicMatch[2]).trim() : '';
}

function getFilename(url, title = '', suggestedFilename = '', mimeType = '', serverFilename = '') {
  let urlFilename = '';
  try {
    const urlObj = new URL(url);
    urlFilename = urlObj.pathname.split('/').pop() || '';
  } catch (e) {}

  const cleanServerFilename = sanitizeFilename(serverFilename);
  const cleanTitle = sanitizeFilename(title);
  const cleanSuggestedFilename = sanitizeFilename(suggestedFilename);
  const cleanUrlFilename = sanitizeFilename(urlFilename);
  const ext = getVideoExtension(
    url,
    mimeType,
    cleanServerFilename || cleanSuggestedFilename || cleanUrlFilename
  );

  if (isUsefulFilename(cleanServerFilename)) {
    return withVideoExtension(cleanServerFilename, ext);
  }
  if (cleanTitle) {
    return withVideoExtension(cleanTitle, ext);
  }
  if (isUsefulFilename(cleanSuggestedFilename)) {
    return withVideoExtension(cleanSuggestedFilename, ext);
  }
  if (isUsefulFilename(cleanUrlFilename)) {
    return withVideoExtension(cleanUrlFilename, ext);
  }
  return `video_${Date.now()}${ext}`;
}

chrome.webRequest.onCompleted.addListener((details) => {
  if (details.tabId === -1) return;
  
  const url = details.url;
  const mimeType = details.responseHeaders?.find(h => h.name.toLowerCase() === 'content-type')?.value || '';
  const serverFilename = getContentDispositionFilename(details.responseHeaders);
  
  if (VIDEO_MIME_TYPES.some(type => mimeType.includes(type)) || isVideoUrl(url)) {
    if (url.includes('blob:')) return;
    
    const existing = detectedVideos.find(v => v.url === url);
    if (!existing) {
      const cachedTitle = tabTitleCache[details.tabId] || '';
      const cleanTitle = cachedTitle.replace(/[-_|·]/g, ' ').trim();
      const displayTitle = cleanTitle.length > 50 ? cleanTitle.substring(0, 50) + '...' : cleanTitle;
      
      const newVideo = {
        id: ++videoIdCounter,
        url: url,
        filename: getFilename(url, displayTitle, '', mimeType, serverFilename),
        title: displayTitle,
        size: details.contentLength || null,
        mimeType: mimeType,
        tabId: details.tabId,
        timestamp: Date.now()
      };
      detectedVideos.push(newVideo);
      
      chrome.storage.local.set({ 
        videos: detectedVideos.filter(v => Date.now() - v.timestamp < 3600000)
      });
      
      chrome.runtime.sendMessage({
        action: 'videoDetected',
        video: newVideo
      }).catch(() => {});
      
      updateVideoSize(newVideo);
    }
  }
}, { urls: ['<all_urls>'] }, ['responseHeaders']);

chrome.webRequest.onBeforeRequest.addListener((details) => {
  if (details.tabId === -1) return;
  
  const url = details.url;
  if (isVideoUrl(url) && !url.includes('blob:')) {
    const existing = detectedVideos.find(v => v.url === url);
    if (!existing) {
      const cachedTitle = tabTitleCache[details.tabId] || '';
      const cleanTitle = cachedTitle.replace(/[-_|·]/g, ' ').trim();
      const displayTitle = cleanTitle.length > 50 ? cleanTitle.substring(0, 50) + '...' : cleanTitle;
      
      const newVideo = {
        id: ++videoIdCounter,
        url: url,
        filename: getFilename(url, displayTitle),
        title: displayTitle,
        size: null,
        mimeType: '',
        tabId: details.tabId,
        timestamp: Date.now()
      };
      detectedVideos.push(newVideo);
      
      chrome.storage.local.set({ 
        videos: detectedVideos.filter(v => Date.now() - v.timestamp < 3600000)
      });
      
      updateVideoSize(newVideo);
    }
  }
}, { urls: ['<all_urls>'] });

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.title) {
    tabTitleCache[tabId] = changeInfo.title;
  }
  if (changeInfo.url) {
    // 页面导航到新URL，清理该标签页的旧视频
    detectedVideos = detectedVideos.filter(v => v.tabId !== tabId);
    chrome.storage.local.set({ videos: detectedVideos });
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
  detectedVideos = detectedVideos.filter(v => v.tabId !== tabId);
  delete tabTitleCache[tabId];
  chrome.storage.local.set({ videos: detectedVideos });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getVideos') {
    const currentTabId = message.tabId;
    const tabVideos = detectedVideos.filter(v => v.tabId === currentTabId);
    sendResponse({ videos: tabVideos });
    return true;
  }
  
  if (message.action === 'getAllVideos') {
    sendResponse({ videos: detectedVideos });
    return true;
  }
  
  if (message.action === 'downloadVideo') {
    const { url, filename } = message;
    const safeFilename = getFilename(url, '', filename);
    chrome.downloads.download({
      url: url,
      filename: safeFilename,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (downloadId) {
        sendResponse({ success: true, downloadId: downloadId });
      } else {
        sendResponse({ success: false, error: chrome.runtime.lastError?.message });
      }
    });
    return true;
  }
  
  if (message.action === 'clearVideos') {
    detectedVideos = [];
    chrome.storage.local.remove('videos');
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
      
      chrome.tabs.sendMessage(tab.id, { action: 'scanVideos' }, (response) => {
        if (response && response.videos) {
          response.videos.forEach(video => {
            const existing = detectedVideos.find(v => v.url === video.url);
            if (!existing) {
              const newVideo = {
                id: ++videoIdCounter,
                url: video.url,
                filename: getFilename(
                  video.url,
                  video.title || displayTitle,
                  video.filename || '',
                  video.mimeType || ''
                ),
                title: video.title || displayTitle,
                size: video.size || null,
                mimeType: video.mimeType || '',
                tabId: tab.id,
                timestamp: Date.now()
              };
              detectedVideos.push(newVideo);
              updateVideoSize(newVideo);
            }
          });
          chrome.storage.local.set({ videos: detectedVideos });
          sendResponse({ success: true });
        } else {
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: scanPageFallback
          }).then((results) => {
            if (results && results[0] && results[0].result) {
              results[0].result.forEach(video => {
                const existing = detectedVideos.find(v => v.url === video.url);
                if (!existing) {
                  const newVideo = {
                    id: ++videoIdCounter,
                    url: video.url,
                    filename: getFilename(video.url, displayTitle),
                    title: displayTitle,
                    size: video.size || null,
                    mimeType: video.mimeType || '',
                    tabId: tab.id,
                    timestamp: Date.now()
                  };
                  detectedVideos.push(newVideo);
                  updateVideoSize(newVideo);
                }
              });
              chrome.storage.local.set({ videos: detectedVideos });
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
  
  return false;
});

chrome.storage.local.get(['videos'], (result) => {
  if (result.videos) {
    detectedVideos = result.videos
      .filter(v => Date.now() - v.timestamp < 3600000)
      .map(video => ({
        ...video,
        filename: getFilename(
          video.url,
          video.title || '',
          video.filename || '',
          video.mimeType || ''
        )
      }));
  }
});

function scanPageFallback() {
  const videos = [];
  const urlSet = new Set();
  
  document.querySelectorAll('video').forEach(video => {
    if (video.src && video.src.startsWith('http')) {
      urlSet.add(video.src);
      videos.push({ url: video.src });
    }
    if (video.currentSrc && video.currentSrc.startsWith('http')) {
      urlSet.add(video.currentSrc);
      videos.push({ url: video.currentSrc });
    }
  });
  
  document.querySelectorAll('source').forEach(source => {
    if (source.src && source.src.startsWith('http')) {
      urlSet.add(source.src);
      videos.push({ url: source.src });
    }
  });
  
  return videos;
}
