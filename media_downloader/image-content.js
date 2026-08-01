(function() {
  'use strict';

  const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.jfif'];

  let capturedImageUrls = new Set();

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

  function extractFilename(url) {
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
          const extMatch = url.toLowerCase().match(/\.([a-z]{3,4})(?:[?&]|$)/);
          if (extMatch) {
            const ext = '.' + extMatch[1];
            if (IMAGE_EXTENSIONS.includes(ext)) {
              return filename + ext;
            }
          }
        }
        return filename;
      }
    } catch (e) {}
    const formatMatch = url.toLowerCase().match(/format=([a-z]+)/);
    const ext = formatMatch ? '.' + formatMatch[1] : '.jpg';
    return 'image_' + Date.now() + ext;
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
      const src = img.src || img.currentSrc || img.dataset.src || img.dataset.srcset || img.dataset.lazySrc;
      if (src && src.startsWith('http') && !src.includes('data:')) {
        const url = src.split(' ')[0].replace(/&amp;/g, '&');
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
          const cleanUrl = (url || '').replace(/&amp;/g, '&');
          if (cleanUrl && cleanUrl.startsWith('http') && !cleanUrl.includes('data:') && !urlSet.has(cleanUrl) && isImageUrl(cleanUrl)) {
            urlSet.add(cleanUrl);
            images.push({
              url: cleanUrl,
              title: getPageTitle(),
              filename: extractFilename(cleanUrl),
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
            const url = match.replace(/url\(['"]?/, '').replace(/['"]?\)/, '').replace(/&amp;/g, '&');
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
      const cleanUrl = href.replace(/&amp;/g, '&');
      if (cleanUrl && cleanUrl.startsWith('http') && isImageUrl(cleanUrl) && !urlSet.has(cleanUrl)) {
        urlSet.add(cleanUrl);
        images.push({
          url: cleanUrl,
          title: getPageTitle(),
          filename: extractFilename(cleanUrl),
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
        /["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|gif|bmp|webp|svg|ico|jfif)[^"']*)["']/gi,
        /["'](https?:\/\/pbs\.twimg\.com\/[^"']+\?format=[^"']+)["']/gi
      ];

      urlPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const url = match[1].replace(/&amp;/g, '&');
          if (url && !url.includes('placeholder') && !url.includes('thumbnail') && !url.includes('preview') && !url.includes('emoji') && !urlSet.has(url) && isImageUrl(url)) {
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
        /["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|gif|bmp|webp|svg|ico|jfif)[^"']*)["']/gi,
        /["'](https?:\/\/pbs\.twimg\.com\/[^"']+\?format=[^"']+)["']/gi
      ];

      urlPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(htmlContent)) !== null) {
          const url = match[1].replace(/&amp;/g, '&');
          if (url && !url.includes('placeholder') && !url.includes('thumbnail') && !url.includes('preview') && !url.includes('emoji') && !urlSet.has(url) && isImageUrl(url)) {
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

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'scanImages') {
      const images = scanAllImages();
      sendResponse({ images: images });
      return true;
    }
    return false;
  });

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
