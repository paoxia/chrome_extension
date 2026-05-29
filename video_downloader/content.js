(function() {
  'use strict';
  
  const videoExtensions = ['.mp4', '.m3u8', '.webm', '.mkv', '.avi', '.mov', '.flv', '.wmv'];
  const videoPatterns = [
    /googlevideo\.com/,
    /youtube\.com\/videoplayback/,
    /ytimg\.com/,
    /twimg\.com\/.*\.mp4/,
    /twitter\.com\/.*\.mp4/,
    /pbs\.twimg\.com/,
    /video\.twimg\.com/,
    /v\.twitter\.com/,
    /video_url/,
    /playbackUrl/
  ];
  
  let capturedVideoUrls = new Set();
  
  function isVideoUrl(url) {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    
    if (videoExtensions.some(ext => lowerUrl.includes(ext))) {
      return true;
    }
    
    if (videoPatterns.some(pattern => pattern.test(url))) {
      return true;
    }
    
    if (lowerUrl.includes('video') && !lowerUrl.includes('videoplayer')) {
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
        return filename;
      }
      
      if (url.includes('youtube.com') || url.includes('googlevideo.com')) {
        return 'youtube_video_' + Date.now();
      }
      
      if (url.includes('twitter.com') || url.includes('twimg.com')) {
        return 'twitter_video_' + Date.now();
      }
      
      return 'video_' + Date.now();
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
    if (lowerUrl.includes('googlevideo.com') || lowerUrl.includes('youtube.com')) return 'YouTube';
    if (lowerUrl.includes('twimg.com') || lowerUrl.includes('twitter.com')) return 'Twitter';
    return 'VIDEO';
  }
  
  function getVideoTitle() {
    let title = document.title || '';
    
    if (window.location.hostname.includes('youtube.com')) {
      title = title.replace(' - YouTube', '').trim();
    }
    
    if (window.location.hostname.includes('twitter.com') || window.location.hostname.includes('x.com')) {
      const tweetElement = document.querySelector('[data-testid="tweet"]');
      if (tweetElement) {
        const textElement = tweetElement.querySelector('[data-testid="tweetText"]');
        if (textElement) {
          const text = textElement.textContent.substring(0, 50);
          title = text + (textElement.textContent.length > 50 ? '...' : '');
        }
      }
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
          type: getVideoType(video.src),
          size: null
        });
      }
      
      if (video.currentSrc && video.currentSrc.startsWith('http')) {
        videos.push({
          url: video.currentSrc,
          title: getVideoTitle(),
          type: getVideoType(video.currentSrc),
          size: null
        });
      }
      
      video.querySelectorAll('source').forEach(source => {
        if (source.src && source.src.startsWith('http')) {
          videos.push({
            url: source.src,
            title: getVideoTitle(),
            type: getVideoType(source.src),
            size: null
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
      
      const urlPatterns = [
        /["'](https?:\/\/[^"']+\.(?:mp4|m3u8|webm|mkv)[^"']*)["']/gi,
        /["'](https?:\/\/[^"']*googlevideo\.com[^"']*)["']/gi,
        /["'](https?:\/\/[^"']*twimg\.com[^"']*\.(?:mp4|webm)[^"']*)["']/gi,
        /video_url["']?\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi,
        /playbackUrl["']?\s*[:=]\s*["'](https?:\/\/[^"']+)["']/gi
      ];
      
      urlPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const url = match[1];
          if (url && !url.includes('placeholder') && !url.includes('thumbnail')) {
            videos.push({
              url: url,
              title: getVideoTitle(),
              type: getVideoType(url),
              size: null
            });
          }
        }
      });
    });
    
    return videos;
  }
  
  function scanTwitterVideos() {
    const videos = [];
    
    if (!window.location.hostname.includes('twitter.com') && 
        !window.location.hostname.includes('x.com')) {
      return videos;
    }
    
    const videoElements = document.querySelectorAll('[data-testid="videoPlayer"]');
    videoElements.forEach(player => {
      const video = player.querySelector('video');
      if (video && video.src) {
        videos.push({
          url: video.src,
          title: getVideoTitle(),
          type: 'Twitter',
          size: null
        });
      }
    });
    
    document.querySelectorAll('video[src*="twimg"], video[src*="twitter"]').forEach(video => {
      if (video.src) {
        videos.push({
          url: video.src,
          title: getVideoTitle(),
          type: 'Twitter',
          size: null
        });
      }
    });
    
    return videos;
  }
  
  function scanYouTubeVideos() {
    const videos = [];
    
    if (!window.location.hostname.includes('youtube.com') && 
        !window.location.hostname.includes('youtu.be')) {
      return videos;
    }
    
    const player = document.querySelector('#movie_player, .html5-video-player');
    if (player) {
      const video = player.querySelector('video');
      if (video) {
        if (video.src) {
          videos.push({
            url: video.src,
            title: getVideoTitle(),
            type: 'YouTube',
            size: null
          });
        }
        
        if (video.currentSrc) {
          videos.push({
            url: video.currentSrc,
            title: getVideoTitle(),
            type: 'YouTube',
            size: null
          });
        }
      }
    }
    
    const ytPlayerData = window.ytInitialPlayerResponse;
    if (ytPlayerData && ytPlayerData.streamingData) {
      const formats = ytPlayerData.streamingData.formats || [];
      const adaptiveFormats = ytPlayerData.streamingData.adaptiveFormats || [];
      
      [...formats, ...adaptiveFormats].forEach(format => {
        if (format.url) {
          videos.push({
            url: format.url,
            title: getVideoTitle(),
            type: 'YouTube',
            size: format.contentLength ? parseInt(format.contentLength) : null,
            quality: format.qualityLabel || format.quality
          });
        }
      });
    }
    
    return videos;
  }
  
  function scanCapturedUrls() {
    const videos = [];
    capturedVideoUrls.forEach(url => {
      videos.push({
        url: url,
        title: getVideoTitle(),
        type: getVideoType(url),
        size: null
      });
    });
    return videos;
  }
  
  function scanAllVideos() {
    const allVideos = [];
    const urlSet = new Set();
    
    const scanners = [
      scanCapturedUrls,
      scanYouTubeVideos,
      scanTwitterVideos,
      scanVideoElements,
      scanNetworkVideos,
      scanScriptsForVideos
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
  
  function interceptNetworkRequests() {
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      if (isVideoUrl(url)) {
        capturedVideoUrls.add(url);
        console.log('[Video Downloader] XHR captured:', url);
      }
      return originalOpen.apply(this, arguments);
    };
    
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
      this.addEventListener('load', function() {
        const responseURL = this.responseURL;
        if (isVideoUrl(responseURL)) {
          capturedVideoUrls.add(responseURL);
          console.log('[Video Downloader] XHR response captured:', responseURL);
        }
      });
      return originalSend.apply(this, arguments);
    };
    
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
      if (typeof url === 'string' && isVideoUrl(url)) {
        capturedVideoUrls.add(url);
        console.log('[Video Downloader] Fetch captured:', url);
      } else if (url && url.url && isVideoUrl(url.url)) {
        capturedVideoUrls.add(url.url);
        console.log('[Video Downloader] Fetch captured:', url.url);
      }
      return originalFetch.apply(this, arguments);
    };
  }
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'scanVideos') {
      const videos = scanAllVideos();
      console.log('[Video Downloader] Found videos:', videos.length);
      sendResponse({videos: videos});
    }
    return true;
  });
  
  interceptNetworkRequests();
  
  console.log('[Video Downloader] Content script loaded');
})();