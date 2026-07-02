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

function isVideoUrl(url) {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('blob:')) return true;
  if (lowerUrl.includes('data:')) return false;
  return VIDEO_EXTENSIONS.some(ext => lowerUrl.includes(ext));
}

function getVideoExtension(url) {
  for (const ext of VIDEO_EXTENSIONS) {
    if (url.toLowerCase().includes(ext)) {
      return ext;
    }
  }
  return '.mp4';
}

function getFilename(url, title = '') {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    let filename = pathname.split('/').pop();
    if (filename && filename.length > 3) {
      const ext = getVideoExtension(url);
      if (title) {
        const cleanTitle = title.replace(/[\\/:*?"<>|]/g, '_');
        return cleanTitle + ext;
      }
      return decodeURIComponent(filename);
    }
  } catch (e) {}
  const ext = getVideoExtension(url);
  if (title) {
    const cleanTitle = title.replace(/[\\/:*?"<>|]/g, '_');
    return cleanTitle + ext;
  }
  return `video_${Date.now()}${ext}`;
}

chrome.webRequest.onCompleted.addListener((details) => {
  if (details.tabId === -1) return;
  
  const url = details.url;
  const mimeType = details.responseHeaders?.find(h => h.name.toLowerCase() === 'content-type')?.value || '';
  
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
        filename: getFilename(url, displayTitle),
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
    }
  }
}, { urls: ['<all_urls>'] });

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.title) {
    tabTitleCache[tabId] = changeInfo.title;
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
    chrome.downloads.download({
      url: url,
      filename: filename,
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
                filename: video.filename || getFilename(video.url, video.title || displayTitle),
                title: video.title || displayTitle,
                size: video.size || null,
                mimeType: video.mimeType || '',
                tabId: tab.id,
                timestamp: Date.now()
              };
              detectedVideos.push(newVideo);
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
    detectedVideos = result.videos.filter(v => Date.now() - v.timestamp < 3600000);
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