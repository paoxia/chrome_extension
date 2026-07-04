(function() {
  'use strict';

  const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico'];

  let capturedImageUrls = new Set();

  function isImageUrl(url) {
    if (!url) return false;
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.startsWith('data:')) return false;
    if (lowerUrl.startsWith('blob:')) return false;
    if (lowerUrl.includes('chrome-extension:')) return false;
    if (IMAGE_EXTENSIONS.some(ext => lowerUrl.includes(ext))) return true;
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
    return 'image_' + Date.now();
  }

  function getPageTitle() {
    let title = document.title || '';
    title = title.replace(/[-_|·]/g, ' ').trim();
    if (title.length > 50) {
      title = title.substring(0, 50) + '...';
    }
    return title || 'page_' + Date.now();
  }

  function scanImgElements() {
    const images = [];
    const urlSet = new Set();

    document.querySelectorAll('img').forEach(img => {
      const src = img.src || img.dataset.src || img.dataset.srcset || img.dataset.lazySrc;
      if (src && src.startsWith('http') && !src.includes('data:')) {
        const url = src.split(' ')[0];
        if (!urlSet.has(url) && isImageUrl(url)) {
          urlSet.add(url);
          images.push({
            url: url,
            title: getPageTitle(),
            filename: extractFilename(url),
            width: img.naturalWidth || img.width || null,
            height: img.naturalHeight || img.height || null,
            size: null,
            mimeType: ''
          });
        }
      }

      const srcset = img.srcset || img.dataset.srcset;
      if (srcset) {
        const sources = srcset.split(',').map(s => s.trim());
        sources.forEach(source => {
          const [url] = source.split(' ');
          if (url && url.startsWith('http') && !url.includes('data:') && !urlSet.has(url) && isImageUrl(url)) {
            urlSet.add(url);
            images.push({
              url: url,
              title: getPageTitle(),
              filename: extractFilename(url),
              width: null,
              height: null,
              size: null,
              mimeType: ''
            });
          }
        });
      }
    });

    return images;
  }

  function scanBackgroundImages() {
    const images = [];
    const urlSet = new Set();

    const elements = document.querySelectorAll('*');
    elements.forEach(el => {
      const style = window.getComputedStyle(el);
      const bgImage = style.backgroundImage || '';
      if (bgImage && bgImage !== 'none') {
        const urlMatch = bgImage.match(/url\(['"]?([^'")]+)['"]?\)/gi);
        if (urlMatch) {
          urlMatch.forEach(match => {
            const url = match.replace(/url\(['"]?/, '').replace(/['"]?\)/, '');
            if (url && url.startsWith('http') && !url.includes('data:') && !urlSet.has(url) && isImageUrl(url)) {
              urlSet.add(url);
              images.push({
                url: url,
                title: getPageTitle(),
                filename: extractFilename(url),
                width: null,
                height: null,
                size: null,
                mimeType: ''
              });
            }
          });
        }
      }
    });

    return images;
  }

  function scanLinkImages() {
    const images = [];
    const urlSet = new Set();

    document.querySelectorAll('a').forEach(link => {
      const href = link.href || '';
      if (href && href.startsWith('http') && isImageUrl(href) && !urlSet.has(href)) {
        urlSet.add(href);
        images.push({
          url: href,
          title: getPageTitle(),
          filename: extractFilename(href),
          width: null,
          height: null,
          size: null,
          mimeType: ''
        });
      }
    });

    return images;
  }

  function scanScriptsForImages() {
    const images = [];
    const urlSet = new Set();

    document.querySelectorAll('script').forEach(script => {
      const content = script.textContent || '';

      const urlPatterns = [
        /["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|gif|bmp|webp|svg|ico)[^"']*)["']/gi,
        /src\s*[:=]\s*["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|gif|bmp|webp|svg|ico)[^"']*)["']/gi,
        /url\s*[:=]\s*["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|gif|bmp|webp|svg|ico)[^"']*)["']/gi
      ];

      urlPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const url = match[1];
          if (url && !url.includes('placeholder') && !url.includes('thumbnail') && !url.includes('preview') && !url.includes('emoji') && !urlSet.has(url)) {
            urlSet.add(url);
            images.push({
              url: url,
              title: getPageTitle(),
              filename: extractFilename(url),
              width: null,
              height: null,
              size: null,
              mimeType: ''
            });
          }
        }
      });
    });

    return images;
  }

  function scanDocumentForImages() {
    const images = [];
    const urlSet = new Set();

    try {
      const htmlContent = document.documentElement.innerHTML;
      const urlPatterns = [
        /["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|gif|bmp|webp|svg|ico)[^"']*)["']/gi
      ];

      urlPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(htmlContent)) !== null) {
          const url = match[1];
          if (url && !url.includes('placeholder') && !url.includes('thumbnail') && !url.includes('preview') && !url.includes('emoji') && !urlSet.has(url)) {
            urlSet.add(url);
            images.push({
              url: url,
              title: getPageTitle(),
              filename: extractFilename(url),
              width: null,
              height: null,
              size: null,
              mimeType: ''
            });
          }
        }
      });
    } catch (e) {
      console.error('[Image Downloader] Scan document error:', e);
    }

    return images;
  }

  function scanAllImages() {
    const allImages = [];
    const urlSet = new Set();

    const scanners = [
      scanImgElements,
      scanBackgroundImages,
      scanLinkImages,
      scanScriptsForImages,
      scanDocumentForImages
    ];

    scanners.forEach(scanner => {
      try {
        const results = scanner();
        results.forEach(img => {
          if (!urlSet.has(img.url)) {
            urlSet.add(img.url);
            allImages.push(img);
            capturedImageUrls.add(img.url);
          }
        });
      } catch (e) {
        console.error('[Image Downloader] Scanner error:', e);
      }
    });

    return allImages;
  }

  function interceptNetworkRequests() {
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
      if (typeof url === 'string' && isImageUrl(url)) {
        capturedImageUrls.add(url);
      }
      return originalOpen.apply(this, arguments);
    };

    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
      const urlString = typeof url === 'string' ? url : (url?.url || '');
      if (urlString && isImageUrl(urlString)) {
        capturedImageUrls.add(urlString);
      }
      return originalFetch.apply(this, arguments);
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'scanImages') {
      const images = scanAllImages();
      sendResponse({ images: images });
    }
    return true;
  });

  interceptNetworkRequests();

  setTimeout(() => {
    const images = scanAllImages();
    if (images.length > 0) {
      chrome.runtime.sendMessage({
        action: 'imageDetected',
        images: images
      }).catch(() => {});
    }
  }, 3000);

  console.log('[Image Downloader] Content script loaded');
})();