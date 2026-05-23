(function() {
  'use strict';
  
  const videoExtensions = ['.mp4', '.m3u8', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv'];
  const videoMimeTypes = ['video/mp4', 'video/webm', 'video/x-mpegURL', 'video/quicktime'];
  
  function isVideoUrl(url) {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    return videoExtensions.some(ext => lowerUrl.includes(ext)) ||
           lowerUrl.includes('video') && lowerUrl.includes('.m3u8');
  }
  
  function extractFilename(url) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split('/').pop();
      return filename || 'video_' + Date.now();
    } catch {
      return 'video_' + Date.now();
    }
  }
  
  function getVideoType(url) {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('.m3u8')) return 'M3U8';
    if (lowerUrl.includes('.mp4')) return 'MP4';
    if (lowerUrl.includes('.webm')) return 'WEBM';
    if (lowerUrl.includes('.mkv')) return 'MKV';
    return 'VIDEO';
  }
  
  function scanVideoElements() {
    const videos = [];
    
    document.querySelectorAll('video').forEach(video => {
      if (video.src) {
        videos.push({
          url: video.src,
          title: document.title || extractFilename(video.src),
          type: getVideoType(video.src),
          size: null
        });
      }
      
      video.querySelectorAll('source').forEach(source => {
        if (source.src) {
          videos.push({
            url: source.src,
            title: document.title || extractFilename(source.src),
            type: getVideoType(source.src),
            size: null
          });
        }
      });
    });
    
    return videos;
  }
  
  function scanIframeVideos() {
    const videos = [];
    
    document.querySelectorAll('iframe').forEach(iframe => {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        iframeDoc.querySelectorAll('video').forEach(video => {
          if (video.src) {
            videos.push({
              url: video.src,
              title: document.title || extractFilename(video.src),
              type: getVideoType(video.src),
              size: null
            });
          }
        });
      } catch (e) {
        // 跨域 iframe 无法访问
      }
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
            title: document.title || extractFilename(resource.name),
            type: getVideoType(resource.name),
            size: resource.transferSize || null
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
      const urlRegex = /["'](https?:\/\/[^"']+\.(?:mp4|m3u8|webm|mkv)[^"']*)["']/gi;
      let match;
      
      while ((match = urlRegex.exec(content)) !== null) {
        const url = match[1];
        videos.push({
          url: url,
          title: document.title || extractFilename(url),
          type: getVideoType(url),
          size: null
        });
      }
    });
    
    return videos;
  }
  
  function scanAllVideos() {
    const allVideos = [];
    const urlSet = new Set();
    
    const scanners = [
      scanVideoElements,
      scanIframeVideos,
      scanNetworkVideos,
      scanScriptsForVideos
    ];
    
    scanners.forEach(scanner => {
      const results = scanner();
      results.forEach(video => {
        if (!urlSet.has(video.url)) {
          urlSet.add(video.url);
          allVideos.push(video);
        }
      });
    });
    
    return allVideos;
  }
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'scanVideos') {
      const videos = scanAllVideos();
      sendResponse({videos: videos});
    }
    return true;
  });
  
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url) {
    if (isVideoUrl(url)) {
      console.log('[Video Downloader] Detected video URL:', url);
    }
    return originalOpen.apply(this, arguments);
  };
  
  console.log('[Video Downloader] Content script loaded');
})();
