importScripts('image-background.js');

let detectedVideos = [];
let videoIdCounter = 0;
let tabTitleCache = {};
let tabUrlCache = {};

// 迅雷 10+ 客户端使用的本机任务接口，与官方 JS-SDK 2.x 保持兼容。
const THUNDER_PORTS = [28317, 36759];
const THUNDER_PID = '11111';
const THUNDER_SIGN_SALT = '123456';

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

function md5(input) {
  function add32(a, b) {
    return (a + b) & 0xffffffff;
  }

  function cmn(q, a, b, x, s, t) {
    a = add32(add32(a, q), add32(x, t));
    return add32((a << s) | (a >>> (32 - s)), b);
  }

  function ff(a, b, c, d, x, s, t) {
    return cmn((b & c) | ((~b) & d), a, b, x, s, t);
  }

  function gg(a, b, c, d, x, s, t) {
    return cmn((b & d) | (c & (~d)), a, b, x, s, t);
  }

  function hh(a, b, c, d, x, s, t) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function ii(a, b, c, d, x, s, t) {
    return cmn(c ^ (b | (~d)), a, b, x, s, t);
  }

  function md5Cycle(state, block) {
    let [a, b, c, d] = state;

    a = ff(a, b, c, d, block[0], 7, -680876936);
    d = ff(d, a, b, c, block[1], 12, -389564586);
    c = ff(c, d, a, b, block[2], 17, 606105819);
    b = ff(b, c, d, a, block[3], 22, -1044525330);
    a = ff(a, b, c, d, block[4], 7, -176418897);
    d = ff(d, a, b, c, block[5], 12, 1200080426);
    c = ff(c, d, a, b, block[6], 17, -1473231341);
    b = ff(b, c, d, a, block[7], 22, -45705983);
    a = ff(a, b, c, d, block[8], 7, 1770035416);
    d = ff(d, a, b, c, block[9], 12, -1958414417);
    c = ff(c, d, a, b, block[10], 17, -42063);
    b = ff(b, c, d, a, block[11], 22, -1990404162);
    a = ff(a, b, c, d, block[12], 7, 1804603682);
    d = ff(d, a, b, c, block[13], 12, -40341101);
    c = ff(c, d, a, b, block[14], 17, -1502002290);
    b = ff(b, c, d, a, block[15], 22, 1236535329);

    a = gg(a, b, c, d, block[1], 5, -165796510);
    d = gg(d, a, b, c, block[6], 9, -1069501632);
    c = gg(c, d, a, b, block[11], 14, 643717713);
    b = gg(b, c, d, a, block[0], 20, -373897302);
    a = gg(a, b, c, d, block[5], 5, -701558691);
    d = gg(d, a, b, c, block[10], 9, 38016083);
    c = gg(c, d, a, b, block[15], 14, -660478335);
    b = gg(b, c, d, a, block[4], 20, -405537848);
    a = gg(a, b, c, d, block[9], 5, 568446438);
    d = gg(d, a, b, c, block[14], 9, -1019803690);
    c = gg(c, d, a, b, block[3], 14, -187363961);
    b = gg(b, c, d, a, block[8], 20, 1163531501);
    a = gg(a, b, c, d, block[13], 5, -1444681467);
    d = gg(d, a, b, c, block[2], 9, -51403784);
    c = gg(c, d, a, b, block[7], 14, 1735328473);
    b = gg(b, c, d, a, block[12], 20, -1926607734);

    a = hh(a, b, c, d, block[5], 4, -378558);
    d = hh(d, a, b, c, block[8], 11, -2022574463);
    c = hh(c, d, a, b, block[11], 16, 1839030562);
    b = hh(b, c, d, a, block[14], 23, -35309556);
    a = hh(a, b, c, d, block[1], 4, -1530992060);
    d = hh(d, a, b, c, block[4], 11, 1272893353);
    c = hh(c, d, a, b, block[7], 16, -155497632);
    b = hh(b, c, d, a, block[10], 23, -1094730640);
    a = hh(a, b, c, d, block[13], 4, 681279174);
    d = hh(d, a, b, c, block[0], 11, -358537222);
    c = hh(c, d, a, b, block[3], 16, -722521979);
    b = hh(b, c, d, a, block[6], 23, 76029189);
    a = hh(a, b, c, d, block[9], 4, -640364487);
    d = hh(d, a, b, c, block[12], 11, -421815835);
    c = hh(c, d, a, b, block[15], 16, 530742520);
    b = hh(b, c, d, a, block[2], 23, -995338651);

    a = ii(a, b, c, d, block[0], 6, -198630844);
    d = ii(d, a, b, c, block[7], 10, 1126891415);
    c = ii(c, d, a, b, block[14], 15, -1416354905);
    b = ii(b, c, d, a, block[5], 21, -57434055);
    a = ii(a, b, c, d, block[12], 6, 1700485571);
    d = ii(d, a, b, c, block[3], 10, -1894986606);
    c = ii(c, d, a, b, block[10], 15, -1051523);
    b = ii(b, c, d, a, block[1], 21, -2054922799);
    a = ii(a, b, c, d, block[8], 6, 1873313359);
    d = ii(d, a, b, c, block[15], 10, -30611744);
    c = ii(c, d, a, b, block[6], 15, -1560198380);
    b = ii(b, c, d, a, block[13], 21, 1309151649);
    a = ii(a, b, c, d, block[4], 6, -145523070);
    d = ii(d, a, b, c, block[11], 10, -1120210379);
    c = ii(c, d, a, b, block[2], 15, 718787259);
    b = ii(b, c, d, a, block[9], 21, -343485551);

    state[0] = add32(a, state[0]);
    state[1] = add32(b, state[1]);
    state[2] = add32(c, state[2]);
    state[3] = add32(d, state[3]);
  }

  function md5Block(text) {
    const blocks = [];
    for (let i = 0; i < 64; i += 4) {
      blocks[i >> 2] = text.charCodeAt(i)
        + (text.charCodeAt(i + 1) << 8)
        + (text.charCodeAt(i + 2) << 16)
        + (text.charCodeAt(i + 3) << 24);
    }
    return blocks;
  }

  const utf8 = unescape(encodeURIComponent(input));
  const state = [1732584193, -271733879, -1732584194, 271733878];
  let index;

  for (index = 64; index <= utf8.length; index += 64) {
    md5Cycle(state, md5Block(utf8.substring(index - 64, index)));
  }

  const tail = new Array(16).fill(0);
  const remainder = utf8.substring(index - 64);
  for (let i = 0; i < remainder.length; i++) {
    tail[i >> 2] |= remainder.charCodeAt(i) << ((i % 4) << 3);
  }
  tail[remainder.length >> 2] |= 0x80 << ((remainder.length % 4) << 3);
  if (remainder.length > 55) {
    md5Cycle(state, tail);
    tail.fill(0);
  }
  tail[14] = utf8.length * 8;
  md5Cycle(state, tail);

  function hex(value) {
    let result = '';
    for (let i = 0; i < 4; i++) {
      result += (`0${(value >>> (i * 8) & 0xff).toString(16)}`).slice(-2);
    }
    return result;
  }

  return state.map(hex).join('');
}

function buildFormBody(value) {
  const pairs = [];

  function append(prefix, currentValue) {
    if (currentValue === undefined) return;
    if (Array.isArray(currentValue)) {
      currentValue.forEach((item, index) => append(`${prefix}[${index}]`, item));
      return;
    }
    if (currentValue !== null && typeof currentValue === 'object') {
      Object.entries(currentValue).forEach(([key, item]) => {
        append(prefix ? `${prefix}[${key}]` : key, item);
      });
      return;
    }
    pairs.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(currentValue ?? '')}`);
  }

  Object.entries(value).forEach(([key, item]) => append(key, item));
  return pairs.join('&');
}

function signThunderPayload(payload) {
  const encoded = buildFormBody(payload);
  const decodedParts = decodeURIComponent(encoded).split('&');
  let signSource = '';

  decodedParts.forEach((part) => {
    const values = part.split('=');
    if (values[1] !== 'undefined') {
      signSource += `${values.shift()}=${encodeURIComponent(values.join('='))}`;
    }
  });

  return {
    ...payload,
    sign: md5(signSource + THUNDER_SIGN_SALT)
  };
}

function toThunderUrl(url) {
  if (/^thunder:\/\//i.test(url)) return url;
  const encodedUrl = encodeURI(`AA${url.trim()}ZZ`).replace(/%20/gi, ' ');
  return `thunder://${btoa(encodedUrl)}`;
}

async function postThunderTask(port, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(`http://127.0.0.1:${port}/new_task/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
      },
      body: buildFormBody(signThunderPayload(payload)),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`迅雷接口返回 HTTP ${response.status}`);
    }

    const result = await response.json();
    if (result?.ret !== 0) {
      throw new Error(`迅雷接口返回错误 ${result?.ret ?? 'unknown'}`);
    }
    return result;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadWithThunder({ url, filename, size, referer, userAgent }) {
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('迅雷下载目前只支持 HTTP/HTTPS 视频地址');
  }

  const payload = {
    tasks: [{
      url: toThunderUrl(url),
      name: filename,
      size: Number(size) > 0 ? Number(size) : undefined,
      referer: referer || undefined
    }],
    thunderPid: THUNDER_PID,
    userAgent: userAgent || undefined,
    extra: {}
  };

  let lastError;
  for (const port of THUNDER_PORTS) {
    try {
      return await postThunderTask(port, payload);
    } catch (error) {
      lastError = error;
    }
  }

  console.error('调用迅雷下载失败:', lastError);
  throw new Error('未检测到可用的迅雷客户端，请确认迅雷已安装并正在运行');
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

  if (cleanTitle) {
    return withVideoExtension(cleanTitle, ext);
  }
  if (isUsefulFilename(cleanServerFilename)) {
    return withVideoExtension(cleanServerFilename, ext);
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
        pageUrl: tabUrlCache[details.tabId] || details.initiator || '',
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
        pageUrl: tabUrlCache[details.tabId] || details.initiator || '',
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
    tabUrlCache[tabId] = changeInfo.url;
    // 页面导航到新URL，清理该标签页的旧视频
    detectedVideos = detectedVideos.filter(v => v.tabId !== tabId);
    chrome.storage.local.set({ videos: detectedVideos });
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (tab) {
      tabTitleCache[tab.id] = tab.title || '';
      tabUrlCache[tab.id] = tab.url || '';
    }
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  detectedVideos = detectedVideos.filter(v => v.tabId !== tabId);
  delete tabTitleCache[tabId];
  delete tabUrlCache[tabId];
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

  if (message.action === 'downloadVideoWithThunder') {
    const { url, filename, size, referer, userAgent } = message;
    const safeFilename = getFilename(url, '', filename);

    downloadWithThunder({
      url,
      filename: safeFilename,
      size,
      referer,
      userAgent
    }).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
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
      tabUrlCache[tab.id] = tab.url || '';
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
                pageUrl: tab.url || '',
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
                    pageUrl: tab.url || '',
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
