(function() {
  'use strict';

  const videoExtensions = ['.mp4', '.m3u8', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv'];
  const videoPatterns = [
    /googlevideo\.com/,
    /youtube\.com\/videoplayback/,
    /twimg\.com\/.*\.mp4/,
    /video\.twimg\.com/,
    /v\.twitter\.com/,
    /video_url/,
    /playbackUrl/
  ];

  let capturedVideoUrls = new Set();
  let mediaSourceUrls = new Set();

  function isVideoUrl(url) {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();

    if (lowerUrl.startsWith('data:')) return false;

    if (videoExtensions.some(ext => lowerUrl.includes(ext))) {
      return true;
    }

    if (videoPatterns.some(pattern => pattern.test(url))) {
      return true;
    }

    return false;
  }

  function extractFilename(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop();
      if (filename && filename.length > 3) {
        return decodeURIComponent(filename);
      }
    } catch (e) {}
    return 'video_' + Date.now();
  }

  function getVideoTitle() {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.content;
    const heading = document.querySelector('main h1, article h1, h1')?.textContent;
    let title = ogTitle || heading || document.title || '';
    title = title.replace(/[-_|·]/g, ' ').trim();
    if (title.length > 50) {
      title = title.substring(0, 50) + '...';
    }
    return title || 'video_' + Date.now();
  }

  function scanVideoElements() {
    const videos = [];

    document.querySelectorAll('video').forEach(video => {
      if (video.src && video.src.startsWith('http')) {
        videos.push({
          url: video.src,
          title: getVideoTitle(),
          type: 'Video Element',
          size: null,
          filename: extractFilename(video.src)
        });
      }

      if (video.currentSrc && video.currentSrc.startsWith('http')) {
        videos.push({
          url: video.currentSrc,
          title: getVideoTitle(),
          type: 'Video Element',
          size: null,
          filename: extractFilename(video.currentSrc)
        });
      }

      video.querySelectorAll('source').forEach(source => {
        if (source.src && source.src.startsWith('http')) {
          videos.push({
            url: source.src,
            title: getVideoTitle(),
            type: 'Source Element',
            size: null,
            filename: extractFilename(source.src)
          });
        }
      });
    });

    return videos;
  }

  function scanNetworkVideos() {
    const videos = [];
    const performance = window.performance;

    if (performance && performance.getEntriesByType) {
      const resources = performance.getEntriesByType('resource');
      resources.forEach(resource => {
        if (isVideoUrl(resource.name)) {
          videos.push({
            url: resource.name,
            title: getVideoTitle(),
            type: 'Network Resource',
            size: resource.transferSize || null,
            filename: extractFilename(resource.name)
          });
        }
      });
    }

    return videos;
  }

  function scanScriptsForVideos() {
    const videos = [];
    const scripts = document.querySelectorAll('script');

    scripts.forEach(script => {
      const content = script.textContent || '';

      const urlPatterns = [
        /["'](https?:\/\/[^"']+\.(?:mp4|m3u8|webm|mkv)[^"']*)["']/gi,
        /["'](https?:\/\/[^"']*googlevideo\.com[^"']*)["']/gi,
        /video_url["']?\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi,
        /playbackUrl["']?\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi,
        /url["']?\s*[:=]\s*["'](https?:\/\/[^"']*\.(?:mp4|webm|m3u8)[^"']*)["']/gi
      ];

      urlPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const url = match[1];
          if (url && !url.includes('placeholder') && !url.includes('thumbnail')) {
            videos.push({
              url: url,
              title: getVideoTitle(),
              type: 'Script Data',
              size: null,
              filename: extractFilename(url)
            });
          }
        }
      });
    });

    return videos;
  }

  function scanMediaSourceUrls() {
    const videos = [];
    mediaSourceUrls.forEach(url => {
      videos.push({
        url: url,
        title: getVideoTitle(),
        type: 'Media Source',
        size: null,
        filename: extractFilename(url)
      });
    });
    return videos;
  }

  function interceptMediaSource() {
    if (window.MediaSource) {
      const originalAddSourceBuffer = MediaSource.prototype.addSourceBuffer;
      MediaSource.prototype.addSourceBuffer = function(mimeType) {
        const sourceBuffer = originalAddSourceBuffer.call(this, mimeType);
        const originalAppendBuffer = sourceBuffer.appendBuffer;
        sourceBuffer.appendBuffer = function(data) {
          originalAppendBuffer.call(this, data);
        };
        return sourceBuffer;
      };
    }
  }

  function interceptNetworkRequests() {
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      if (typeof url === 'string' && isVideoUrl(url)) {
        capturedVideoUrls.add(url);
        mediaSourceUrls.add(url);
      }
      return originalOpen.apply(this, arguments);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
      this.addEventListener('load', function() {
        const responseURL = this.responseURL;
        if (responseURL && isVideoUrl(responseURL)) {
          capturedVideoUrls.add(responseURL);
          mediaSourceUrls.add(responseURL);
        }
      });
      return originalSend.apply(this, arguments);
    };

    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
      const urlString = typeof url === 'string' ? url : (url?.url || '');
      if (urlString && isVideoUrl(urlString)) {
        capturedVideoUrls.add(urlString);
        mediaSourceUrls.add(urlString);
      }
      return originalFetch.apply(this, arguments);
    };

    const originalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
      const xhr = new originalXHR();
      const originalOpen = xhr.open.bind(xhr);
      xhr.open = function(method, url) {
        if (typeof url === 'string' && isVideoUrl(url)) {
          capturedVideoUrls.add(url);
          mediaSourceUrls.add(url);
        }
        return originalOpen(method, url);
      };
      return xhr;
    };
  }

  function scanAllVideos() {
    const allVideos = [];
    const urlSet = new Set();

    const scanners = [
      scanVideoElements,
      scanNetworkVideos,
      scanScriptsForVideos,
      scanMediaSourceUrls
    ];

    scanners.forEach(scanner => {
      try {
        const results = scanner();
        results.forEach(video => {
          if (!urlSet.has(video.url)) {
            urlSet.add(video.url);
            allVideos.push(video);
          }
        });
      } catch (e) {
        console.error('[Video Downloader] Scanner error:', e);
      }
    });

    return allVideos;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'scanVideos') {
      const videos = scanAllVideos();
      sendResponse({ videos: videos });
      return true;
    }
    return false;
  });

  interceptNetworkRequests();
  interceptMediaSource();

  console.log('[Video Downloader] Content script loaded');
})();
